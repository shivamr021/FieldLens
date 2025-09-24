import os
import httpx
from fastapi import APIRouter, Depends, Request, Response, BackgroundTasks
from twilio.rest import Client

from app.deps import get_db
from app.utils import normalize_phone, EXAMPLE_URL_LABEL, EXAMPLE_URL_AZIMUTH, send_whatsapp_image
from app.services.storage_s3 import new_image_key, put_bytes
from app.services.validate import run_pipeline
from app.services.imaging import load_bgr

# --- Twilio credentials ---
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
TWILIO_WHATSAPP_FROM = os.getenv("TWILIO_WHATSAPP_FROM")  # e.g. 'whatsapp:+14155238886'

router = APIRouter()

# Instantiate Twilio REST client once
twilio_client = None
if TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN:
    twilio_client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)

def _twiml(msg: str) -> Response:
    """
    Text-only TwiML fallback (optional)
    """
    xml_content = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response><Message>{msg}</Message></Response>"""
    return Response(content=xml_content, media_type="application/xml")

async def _fetch_media(url: str) -> bytes:
    async with httpx.AsyncClient(auth=(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN), timeout=30, follow_redirects=True) as client:
        r = await client.get(url)
        r.raise_for_status()
        return r.content

def _current_expected_type(job):
    idx = job.get("currentIndex", 0)
    r = job.get("requiredTypes", [])
    if idx < len(r):
        return r[idx]
    return None

def _prompt_for(ptype: str) -> tuple[str, str]:
    if ptype == "AZIMUTH":
        return ("Please send the **Azimuth Photo** with a clear compass reading.", EXAMPLE_URL_AZIMUTH)
    else:
        return ("Please send the **Label Photo** (flat, sharp, no glare).", EXAMPLE_URL_LABEL)

# -------------------- MAIN WEBHOOK --------------------
@router.post("/whatsapp/webhook")
async def whatsapp_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    db=Depends(get_db)
):
    form = await request.form()
    from_num = normalize_phone(form.get("From") or form.get("WaId") or "")
    media_count = int(form.get("NumMedia") or 0)

    job = db.jobs.find_one({
        "workerPhone": from_num,
        "status": {"$in": ["PENDING", "IN_PROGRESS"]}
    })

    if not job:
        return _twiml("No active job assigned yet. Please contact your supervisor.")

    if job["status"] == "PENDING":
        db.jobs.update_one({"_id": job["_id"]}, {"$set": {"status": "IN_PROGRESS"}})

    expected = _current_expected_type(job)

    # ---- no media received: send text + example image ----
    if media_count == 0:
        prompt, example_url = _prompt_for(expected or "LABEL")

        # Send text first (via TwiML response)
        response = _twiml(f"{prompt}\nSend 1 image at a time.")

        # Send example image in a separate message via background task
        if from_num:
            background_tasks.add_task(
                send_whatsapp_image,
                to_number=from_num,
                image_url=example_url,
                text="Example image for reference"
            )

        return response

    # ---- image received ----
    media_url = form.get("MediaUrl0")
    content_type = form.get("MediaContentType0", "image/jpeg")
    if not media_url or not content_type.startswith("image/"):
        prompt, _ = _prompt_for(expected or "LABEL")
        return _twiml(f"Please send a valid image. {prompt}")

    data = await _fetch_media(media_url)
    img = load_bgr(data)

    prev_phashes = [p.get("phash") for p in db.photos.find({"jobId": str(job["_id"])}, {"phash": 1}) if p.get("phash")]

    result = run_pipeline(img, job_ctx={"expectedType": expected}, existing_phashes=prev_phashes)

    key = new_image_key(str(job["_id"]), result["type"].lower(), "jpg")
    put_bytes(key, data)

    photo_doc = {
        "jobId": str(job["_id"]),
        "type": result["type"],
        "s3Key": key,
        "phash": result["phash"],
        "ocrText": result["ocrText"],
        "fields": result["fields"],
        "checks": result["checks"],
        "status": result["status"],
        "reason": result["reason"],
    }
    db.photos.insert_one(photo_doc)

    if result["status"] == "PASS":
        if expected == result["type"]:
            db.jobs.update_one({"_id": job["_id"]}, {"$inc": {"currentIndex": 1}})
            job = db.jobs.find_one({"_id": job["_id"]})

        next_expected = _current_expected_type(job)
        if next_expected is None:
            db.jobs.update_one({"_id": job["_id"]}, {"$set": {"status": "DONE"}})
            return _twiml("✅ Received and verified. All photos complete. Thank you!")
        else:
            prompt, example = _prompt_for(next_expected)

            # send next example image in background
            background_tasks.add_task(
                send_whatsapp_image,
                to_number=from_num,
                image_url=example,
                text="Next example image"
            )

            return _twiml(f"✅ {result['type']} verified.\nNext: {prompt}")
    else:
        prompt, example = _prompt_for(expected or result["type"])
        reasons = "; ".join(result["reason"]) or "needs retake"

        # send retry example image in background
        background_tasks.add_task(
            send_whatsapp_image,
            to_number=from_num,
            image_url=example,
            text="Please retake"
        )

        return _twiml(f"❌ {result['type']} failed: {reasons}. Please retake and resend.")

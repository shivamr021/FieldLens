import os, httpx
from fastapi import APIRouter, Depends, Request
from bson import ObjectId

# --- add near the top ---
from fastapi import UploadFile, File, Form
from fastapi.responses import JSONResponse

from app.deps import get_db
from app.utils import normalize_phone, EXAMPLE_URL_LABEL, EXAMPLE_URL_AZIMUTH
from app.services.storage_s3 import new_image_key, put_bytes
from app.services.validate import run_pipeline
from app.services.imaging import load_bgr

TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")

router = APIRouter()


def _twiml(msg: str, media_url: str | None = None) -> str:
    # Minimal TwiML XML
    if media_url:
        return f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>
    <Body>{msg}</Body>
    <Media>{media_url}</Media>
  </Message>
</Response>"""
    else:
        return f"""<?xml version="1.0" encoding="UTF-8"?>
<Response><Message>{msg}</Message></Response>"""


async def _fetch_media(url: str) -> bytes:
    async with httpx.AsyncClient(auth=(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN), timeout=30) as client:
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
        return ("Please send the **Azimuth Photo** with a clear compass reading.",
                EXAMPLE_URL_AZIMUTH)
    else:
        return ("Please send the **Label Photo** (flat, sharp, no glare).",
                EXAMPLE_URL_LABEL)


@router.post("/whatsapp/webhook")
async def whatsapp_webhook(request: Request, db=Depends(get_db)):
    form = await request.form()
    from_num = normalize_phone(form.get("From") or form.get("WaId") or "")
    body = (form.get("Body") or "").strip().lower()
    media_count = int(form.get("NumMedia") or 0)

    # Find an active job
    job = db.jobs.find_one({
        "workerPhone": from_num,
        "status": {"$in": ["PENDING", "IN_PROGRESS"]}
    })

    if not job:
        # No job: tell user
        msg = "No active job assigned yet. Please contact your supervisor."
        return _twiml(msg)

    # Mark in-progress
    if job["status"] == "PENDING":
        db.jobs.update_one({"_id": job["_id"]}, {"$set": {"status": "IN_PROGRESS"}})

    expected = _current_expected_type(job)

    if media_count == 0:
        # Text only – (re)prompt
        prompt, example = _prompt_for(expected or "LABEL")
        return _twiml(f"{prompt}\nSend 1 image at a time.", example)

    # Take first media
    media_url = form.get("MediaUrl0")
    content_type = form.get("MediaContentType0", "image/jpeg")
    if not media_url or not content_type.startswith("image/"):
        prompt, example = _prompt_for(expected or "LABEL")
        return _twiml(f"Please send a valid image. {prompt}", example)

    # Download image from Twilio
    data = await _fetch_media(media_url)
    img = load_bgr(data)

    # Gather existing pHashes for duplicate check within this job
    prev_phashes = [p.get("phash") for p in db.photos.find({"jobId": str(job["_id"])}, {"phash": 1}) if p.get("phash")]

    # Run validation pipeline
    result = run_pipeline(
        img,
        job_ctx={"expectedType": expected},
        existing_phashes=prev_phashes
    )

    # Store to S3 (or local)
    key = new_image_key(str(job["_id"]), result["type"].lower(), "jpg")
    put_bytes(key, data)

    # Persist photo doc
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
    ins = db.photos.insert_one(photo_doc)

    # Advance or re-prompt
    if result["status"] == "PASS":
        # advance index if this was the expected type; else keep index
        if expected == result["type"]:
            db.jobs.update_one({"_id": job["_id"]}, {"$inc": {"currentIndex": 1}})
            job = db.jobs.find_one({"_id": job["_id"]})

        next_expected = _current_expected_type(job)
        if next_expected is None:
            db.jobs.update_one({"_id": job["_id"]}, {"$set": {"status": "DONE"}})
            return _twiml("✅ Received and verified. All photos complete. Thank you!")
        else:
            prompt, example = _prompt_for(next_expected)
            return _twiml(f"✅ {result['type']} verified.\nNext: {prompt}", example)
    else:
        prompt, example = _prompt_for(expected or result["type"])
        reasons = "; ".join(result["reason"]) or "needs retake"
        return _twiml(f"❌ {result['type']} failed: {reasons}. Please retake and resend.", example)

# --- at bottom of file, add this route ---
@router.post("/debug/upload")
async def debug_upload(
    workerPhone: str = Form(...),
    file: UploadFile = File(...)
    , db=Depends(get_db)
):
    # Find or create a minimal job for the phone
    job = db.jobs.find_one({
        "workerPhone": workerPhone,
        "status": {"$in": ["PENDING", "IN_PROGRESS"]}
    })
    if not job:
        # create a default LABEL->AZIMUTH job for testing
        job = {
            "workerPhone": workerPhone,
            "requiredTypes": ["LABEL","AZIMUTH"],
            "currentIndex": 0,
            "status": "IN_PROGRESS"
        }
        ins = db.jobs.insert_one(job)
        job["_id"] = ins.inserted_id

    expected = _current_expected_type(job)
    data = await file.read()
    img = load_bgr(data)

    prev_phashes = [p.get("phash") for p in db.photos.find({"jobId": str(job["_id"])}, {"phash": 1}) if p.get("phash")]

    result = run_pipeline(
        img,
        job_ctx={"expectedType": expected},
        existing_phashes=prev_phashes
    )

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

    # advance if pass and expected matches
    if result["status"] == "PASS" and expected == result["type"]:
        db.jobs.update_one({"_id": job["_id"]}, {"$inc": {"currentIndex": 1}})
        job = db.jobs.find_one({"_id": job["_id"]})
        if _current_expected_type(job) is None:
            db.jobs.update_one({"_id": job["_id"]}, {"$set": {"status": "DONE"}})

    return JSONResponse({
        "jobId": str(job["_id"]),
        "type": result["type"],
        "status": result["status"],
        "reason": result["reason"],
        "fields": result["fields"],
        "checks": result["checks"],
        "s3Key": key
    })
import os
import httpx
from fastapi import APIRouter, Depends, Request, Response
from twilio.twiml.messaging_response import MessagingResponse

from app.deps import get_db
from app.services.validate import run_pipeline
from app.services.imaging import load_bgr
from app.services.storage_s3 import new_image_key, put_bytes

TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")

router = APIRouter()


async def _fetch_media(url: str) -> bytes:
    """Download media bytes using Twilio media URL."""
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


from app.utils import (
    normalize_phone,
    type_prompt,
    type_example_url,
    is_validated_type,
)

def _prompt_for(ptype: str) -> tuple[str, str]:
    """Return (prompt, example_url) for a given canonical type."""
    return (type_prompt(ptype), type_example_url(ptype))


def build_twiml_reply(body_text: str, media_urls: list[str] | None = None) -> Response:
    """Build a TwiML MessagingResponse with optional media URLs."""
    resp = MessagingResponse()
    msg = resp.message(body_text)
    if media_urls:
        for m in media_urls:
            msg.media(m)
    xml = str(resp)
    print("[TWIML OUT]\n", xml)
    return Response(content=xml, media_type="application/xml")


@router.post("/whatsapp/webhook")
async def whatsapp_webhook(request: Request, db=Depends(get_db)):
    form = await request.form()
    from_param = form.get("From") or form.get("WaId") or ""
    from_num = normalize_phone(from_param)
    media_count = int(form.get("NumMedia") or 0)
    print("[INCOMING] From:", from_param, "Normalized:", from_num, "NumMedia:", media_count)

    job = db.jobs.find_one({
        "workerPhone": from_num,
        "status": {"$in": ["PENDING", "IN_PROGRESS"]}
    })

    if not job:
        return build_twiml_reply("No active job assigned yet. Please contact your supervisor.")

    if job["status"] == "PENDING":
        db.jobs.update_one({"_id": job["_id"]}, {"$set": {"status": "IN_PROGRESS"}})

    expected = _current_expected_type(job)

    if media_count == 0:
        prompt, example_url = _prompt_for(expected or "LABEL")
        return build_twiml_reply(f"{prompt}\nSend 1 image at a time.", media_urls=[example_url])

    media_url = form.get("MediaUrl0")
    content_type = form.get("MediaContentType0", "image/jpeg")
    if not media_url or not content_type.startswith("image/"):
        prompt, _ = _prompt_for(expected or "LABEL")
        return build_twiml_reply(f"Please send a valid image. {prompt}")

    data = await _fetch_media(media_url)
    img = load_bgr(data)

    prev_phashes = [p.get("phash") for p in db.photos.find({"jobId": str(job["_id"])}, {"phash": 1}) if p.get("phash")]
    
    # ---- NON-BREAKING: validate only for known validated types; otherwise accept/store ----
    if expected and is_validated_type(expected):
        result = run_pipeline(img, job_ctx={"expectedType": expected}, existing_phashes=prev_phashes)
    else:
        # Minimal, safe result for non-validated types (you can expand later)
        result = {
            "type": expected or "PHOTO",
            "status": "PASS",
            "reason": [],
            "fields": {},
            "checks": {},
            # Optional: if your imaging service has a phash helper, you can compute & store it;
            # otherwise omit 'phash' and everything still works.
        }
    # ----------------------------------------------------------------------


    key = new_image_key(str(job["_id"]), result["type"].lower(), "jpg")
    put_bytes(key, data)

    photo_doc = {
        "jobId": str(job["_id"]),
        "type": result["type"],
        "s3Key": key,
        "phash": result.get("phash"),
        "ocrText": result.get("ocrText"),
        "fields": result.get("fields"),
        "checks": result.get("checks"),
        "status": result.get("status"),
        "reason": result.get("reason"),
    }
    db.photos.insert_one(photo_doc)

    if result["status"] == "PASS":
        if expected == result["type"]:
            db.jobs.update_one({"_id": job["_id"]}, {"$inc": {"currentIndex": 1}})
            job = db.jobs.find_one({"_id": job["_id"]})

        next_expected = _current_expected_type(job)
        if next_expected is None:
            db.jobs.update_one({"_id": job["_id"]}, {"$set": {"status": "DONE"}})
            return build_twiml_reply("✅ Received and verified. All photos complete. Thank you!")
        prompt, example = _prompt_for(next_expected)
        return build_twiml_reply(f"✅ {result['type']} verified.\nNext: {prompt}", media_urls=[example])

    prompt, example = _prompt_for(expected or result["type"])
    reasons = "; ".join(result.get("reason") or []) or "needs retake"
    return build_twiml_reply(f"❌ {result['type']} failed: {reasons}. Please retake and resend.", media_urls=[example])

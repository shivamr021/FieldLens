import os
import traceback
from typing import Tuple, List, Optional

import cv2  # NEW: for fast downscale
import httpx
from fastapi import APIRouter, Depends, Request, Response, Form, File, UploadFile, BackgroundTasks
from fastapi.responses import JSONResponse, PlainTextResponse
from twilio.twiml.messaging_response import MessagingResponse

from app.deps import get_db
from app.services.validate import run_pipeline
from app.services.imaging import load_bgr
from app.services.storage_s3 import new_image_key, put_bytes
from app.utils import (
    normalize_phone,
    type_prompt,
    type_example_url,
    is_validated_type,
    twilio_client,           # uses your env; may be None if not configured
    TWILIO_WHATSAPP_FROM,    # sender
)

TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
APP_BASE_URL = os.getenv("APP_BASE_URL")

router = APIRouter()

# ---------- helpers ----------
async def _fetch_media(url: str) -> bytes:
    if not TWILIO_ACCOUNT_SID or not TWILIO_AUTH_TOKEN:
        raise RuntimeError("Twilio auth not configured.")
    async with httpx.AsyncClient(
        auth=(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN),
        timeout=30,
        follow_redirects=True,
    ) as client:
        r = await client.get(url)
        r.raise_for_status()
        return r.content

def _current_expected_type(job: dict) -> Optional[str]:
    idx = int(job.get("currentIndex", 0) or 0)
    r = job.get("requiredTypes", []) or []
    return r[idx] if 0 <= idx < len(r) else None

def _prompt_for(ptype: str) -> Tuple[str, str]:
    return (type_prompt(ptype), type_example_url(ptype))

def build_twiml_reply(body_text: str, media_urls: Optional[List[str] | str] = None) -> Response:
    resp = MessagingResponse()
    msg = resp.message(body_text)
    if isinstance(media_urls, str):
        media_urls = [media_urls]
    if media_urls:
        for m in media_urls:
            if m and m.lower().startswith(("http://", "https://")):
                msg.media(m)
    xml = str(resp)
    print("[TWIML OUT]\n", xml)
    return Response(content=xml, media_type="application/xml")

def _safe_example_list(example_url: Optional[str]) -> Optional[List[str]]:
    if not example_url:
        return None
    s = example_url.strip()
    return [s] if s.lower().startswith(("http://", "https://")) else None

def _downscale_for_ocr(bgr, max_side: int = 1280):
    """Keep aspect; limit longest side to max_side for faster OCR."""
    h, w = bgr.shape[:2]
    m = max(h, w)
    if m <= max_side:
        return bgr
    scale = max_side / float(m)
    nh, nw = int(h * scale), int(w * scale)
    return cv2.resize(bgr, (nw, nh), interpolation=cv2.INTER_AREA)

# ---------- background pipeline ----------
def _process_and_notify(db, worker_number: str, job_id: str, result_type_hint: Optional[str],
                        image_bytes: bytes):
    """
    Runs validation, updates DB/job, and proactively notifies the worker
    with next-prompt or retake via Twilio REST (if configured).
    """
    try:
        # 1) Reload fresh job (it may have changed)
        job = db.jobs.find_one({"_id": job_id})
        if not job:
            print("[BG] Job missing; aborting notify.")
            return

        expected = _current_expected_type(job)

        # 2) Decode + downscale for speed
        img = load_bgr(image_bytes)
        if img is None:
            raise ValueError("decode_failed")
        img_small = _downscale_for_ocr(img)

        # 3) prev phashes
        expected = _current_expected_type(job)  # already present above
        prev_phashes = [
            p.get("phash")
            for p in db.photos.find(
                {
                    "jobId": str(job["_id"]),
                    "type": (expected or "").upper(),
                    "status": {"$in": ["PASS", "FAIL"]},   # ignore PROCESSING/None
                },
                {"phash": 1}
            )
            if p.get("phash")
        ]

        # 4) validate
        result = run_pipeline(
            img_small,
            job_ctx={"expectedType": expected},
            existing_phashes=prev_phashes
        )

        # --- NEW: Promote identifiers to the job for easy UI/export ---
        fields = result.get("fields") or {}
        updates = {}

        if fields.get("macId"):
            updates["macId"] = fields["macId"]
        if fields.get("rsn"):
            updates["rsnId"] = fields["rsn"]              # keep key name 'rsnId'
        if fields.get("azimuthDeg") is not None:
            updates["azimuthDeg"] = fields["azimuthDeg"]

        if updates:
            db.jobs.update_one({"_id": job["_id"]}, {"$set": updates})
        # --- END NEW ---

        result_type = (result.get("type") or expected or "LABELLING").upper()

        # 5) update last inserted photo (the one we saved in webhook)
        last_photo = db.photos.find_one(
            {"jobId": str(job["_id"])},
            sort=[("_id", -1)]
        )
        if last_photo:
            db.photos.update_one(
                {"_id": last_photo["_id"]},
                {"$set": {
                    "type": result_type,
                    "phash": result.get("phash"),
                    "ocrText": result.get("ocrText"),
                    "fields": result.get("fields") or {},
                    "checks": result.get("checks") or {},
                    "status": result.get("status"),
                    "reason": result.get("reason") or [],
                }}
            )

        # 6) advance or ask retake
        status = (result.get("status") or "").upper()
        if status == "PASS" and expected and result_type == expected:
            db.jobs.update_one({"_id": job["_id"]}, {"$inc": {"currentIndex": 1}})
            job = db.jobs.find_one({"_id": job["_id"]})

        # 7) Compose outbound message
        text = ""
        media = None
        if (result.get("status") or "").upper() == "PASS":
            next_expected = _current_expected_type(job)
            if next_expected is None:
                db.jobs.update_one({"_id": job["_id"]}, {"$set": {"status": "DONE"}})
                text = (
                    "✅ Received and verified. All photos complete. Thank you!\n"
                    "✅ सभी फोटो मिल गए और सही हैं। धन्यवाद!"
                )
            else:
                prompt, example = _prompt_for(next_expected)
                text = f"✅ {result_type} verified.\nNext: {prompt}\nअब अगली फोटो भेजें।"
                media = example
        else:
            fallback_type = expected or result_type
            prompt, example = _prompt_for(fallback_type)
            reasons = "; ".join(result.get("reason") or []) or "needs retake"
            text = (
                f"❌ {result_type} failed: {reasons}.\n"
                f"Please retake and resend.\n{prompt}\n"
                f"कृपया दोबारा साफ फोटो भेजें।"
            )
            media = example

        # 8) Send proactive WhatsApp message (if REST client configured)
        if twilio_client and TWILIO_WHATSAPP_FROM:
            to_number = worker_number if worker_number.startswith("whatsapp:") else f"whatsapp:{worker_number}"
            kwargs = {"from_": TWILIO_WHATSAPP_FROM, "to": to_number, "body": text}
            if media and media.lower().startswith(("http://", "https://")):
                kwargs["media_url"] = [media]
            msg = twilio_client.messages.create(**kwargs)
            print(f"[BG] Notified worker, SID={msg.sid}")
        else:
            print("[BG] Twilio REST not configured; outbound message skipped.")
            print("[BG] Would have sent:", text)

    except Exception as e:
        print("[BG] Pipeline/notify error:", repr(e))
        traceback.print_exc()

# ---------- webhook ----------
@router.post("/whatsapp/webhook")
async def whatsapp_webhook(request: Request, background: BackgroundTasks, db=Depends(get_db)):
    try:
        form = await request.form()
    except Exception as e:
        try:
            _ = await request.json()
            return PlainTextResponse("Unsupported content-type", status_code=415)
        except Exception:
            return PlainTextResponse("Bad Request", status_code=400)

    from_param = form.get("From") or form.get("WaId") or ""
    from_num = normalize_phone(from_param)
    media_count = int(form.get("NumMedia") or 0)
    print(f"[INCOMING] From: {from_param} Normalized: {from_num} NumMedia: {media_count}")

    job = db.jobs.find_one({
        "workerPhone": from_num,
        "status": {"$in": ["PENDING", "IN_PROGRESS"]}
    })
    if not job:
        return build_twiml_reply(
            "No active job assigned yet. Please contact your supervisor.\n"
            "कोई सक्रिय जॉब असाइन नहीं है। कृपया सुपरवाइज़र से संपर्क करें।"
        )

    if job.get("status") == "PENDING":
        db.jobs.update_one({"_id": job["_id"]}, {"$set": {"status": "IN_PROGRESS"}})

    expected = _current_expected_type(job)

    # Text-only → (re)prompt fast
    if media_count == 0:
        fallback = expected or "LABELLING"
        prompt, example = _prompt_for(fallback)
        return build_twiml_reply(
            f"{prompt}\nSend 1 image at a time.\nएक समय में सिर्फ 1 फोटो भेजें।",
            media_urls=_safe_example_list(example),
        )

    # Validate content-type quickly
    media_url = form.get("MediaUrl0")
    content_type = form.get("MediaContentType0", "")
    if not media_url or not content_type.startswith("image/"):
        fallback = expected or "LABELLING"
        prompt, example = _prompt_for(fallback)
        return build_twiml_reply(
            f"Please send a valid image. {prompt}\nकृपया सही इमेज भेजें।",
            media_urls=_safe_example_list(example),
        )

    # Download bytes (fast) and persist immediately
    try:
        data = await _fetch_media(media_url)
    except Exception as e:
        print("[WHATSAPP] Media fetch error:", repr(e))
        fallback = expected or "LABELLING"
        prompt, example = _prompt_for(fallback)
        return build_twiml_reply(
            f"❌ Could not download the image. Please resend.\n"
            f"इमेज डाउनलोड नहीं हो सकी, दोबारा भेजें।\n{prompt}",
            media_urls=_safe_example_list(example),
        )

    # Save image now (so background worker can read it reliably)
    try:
        # Temporarily tag type as expected/result_hint for key naming
        result_hint = (expected or "LABELLING").upper()
        key = new_image_key(str(job["_id"]), result_hint.lower(), "jpg")
        put_bytes(key, data)

        db.photos.insert_one({
            "jobId": str(job["_id"]),
            "type": result_hint,
            "s3Key": key,
            "phash": None,
            "ocrText": None,
            "fields": {},
            "checks": {},
            "status": "PROCESSING",
            "reason": [],
        })
    except Exception as e:
        print("[STORAGE/DB] initial save error:", repr(e))
        return build_twiml_reply(
            "❌ Could not save the image. Please resend later.\n"
            "इमेज सेव नहीं हो पाई, बाद में दोबारा भेजें।"
        )

    # Kick off background validation → update DB → notify worker
    background.add_task(_process_and_notify, db, from_num, job["_id"], result_hint, data)

    # Immediate ACK to stay well under 15s
    return build_twiml_reply(
        "📥 Got the photo. Processing… please wait for the next instruction.\n"
        "📥 फोटो मिल गई। प्रोसेस हो रही है — अगला निर्देश जल्दी मिलेगा।"
    )


# ---------------------------
# Debug: direct upload endpoint (bypasses WhatsApp)
# ---------------------------
@router.post("/debug/upload")
async def debug_upload(
    workerPhone: str = Form(...),
    file: UploadFile = File(...),
    db=Depends(get_db),
):
    """
    Convenience route for testing the validation pipeline without WhatsApp.
    - Ensures a minimal job exists (LABELLING -> AZIMUTH)
    - Runs pipeline on the uploaded image
    - Saves photo + advances currentIndex on PASS if it matches expected
    """
    # Ensure job exists
    job = db.jobs.find_one({
        "workerPhone": workerPhone,
        "status": {"$in": ["PENDING", "IN_PROGRESS"]}
    })
    if not job:
        job = {
            "workerPhone": workerPhone,
            "requiredTypes": ["LABELLING", "AZIMUTH"],
            "currentIndex": 0,
            "status": "IN_PROGRESS",
        }
        ins = db.jobs.insert_one(job)
        job["_id"] = ins.inserted_id

    expected = _current_expected_type(job)

    data = await file.read()
    try:
        img = load_bgr(data)
        if img is None:
            raise ValueError("Could not decode image.")
    except Exception as e:
        return JSONResponse(
            {"error": f"decode_failed: {repr(e)}"},
            status_code=400
        )

    prev_phashes = [
        p.get("phash")
        for p in db.photos.find(
            {
                "jobId": str(job["_id"]),
                "type": (expected or "").upper(),
                "status": {"$in": ["PASS", "FAIL"]},   # ignore PROCESSING/None
            },
            {"phash": 1}
        )
        if p.get("phash")
    ]

    try:
        result = run_pipeline(
            img,
            job_ctx={"expectedType": expected},
            existing_phashes=prev_phashes
        )

        # --- NEW: Promote identifiers to the job for easy UI/export ---
        fields = result.get("fields") or {}
        updates = {}

        if fields.get("macId"):
            updates["macId"] = fields["macId"]
        if fields.get("rsn"):
            updates["rsnId"] = fields["rsn"]
        if fields.get("azimuthDeg") is not None:
            updates["azimuthDeg"] = fields["azimuthDeg"]

        if updates:
            db.jobs.update_one({"_id": job["_id"]}, {"$set": updates})
        # --- END NEW ---

    except Exception as e:
        traceback.print_exc()
        return JSONResponse({"error": f"pipeline_crashed: {repr(e)}"}, status_code=500)

    # Save
    result_type = (result.get("type") or expected or "LABELLING").upper()
    try:
        key = new_image_key(str(job["_id"]), result_type.lower(), "jpg")
        put_bytes(key, data)

        photo_doc = {
            "jobId": str(job["_id"]),
            "type": result_type,
            "s3Key": key,
            "phash": result.get("phash"),
            "ocrText": result.get("ocrText"),
            "fields": result.get("fields") or {},
            "checks": result.get("checks") or {},
            "status": result.get("status"),
            "reason": result.get("reason") or [],
        }
        db.photos.insert_one(photo_doc)
    except Exception as e:
        traceback.print_exc()
        return JSONResponse({"error": f"save_failed: {repr(e)}"}, status_code=500)

    # Advance on PASS if it matches expected
    if (result.get("status") or "").upper() == "PASS" and expected and result_type == expected:
        db.jobs.update_one({"_id": job["_id"]}, {"$inc": {"currentIndex": 1}})
        job = db.jobs.find_one({"_id": job["_id"]})
        if _current_expected_type(job) is None:
            db.jobs.update_one({"_id": job["_id"]}, {"$set": {"status": "DONE"}})

    return JSONResponse({
        "jobId": str(job["_id"]),
        "type": result_type,
        "status": result.get("status"),
        "reason": result.get("reason") or [],
        "fields": result.get("fields") or {},
        "checks": result.get("checks") or {},
        "s3Key": key
    })

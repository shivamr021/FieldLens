from fastapi import APIRouter, Depends, HTTPException, Response
from bson import ObjectId
from typing import List
import csv, io

from app.deps import get_db
from app.schemas import CreateJob, JobOut, PhotoOut
from app.models import new_job
from app.services.storage_s3 import presign_url
# New
from app.utils import normalize_phone, build_required_types_for_sector, type_label  # add
router = APIRouter()
# --- add near the top with your other imports ---
import os, tempfile
from typing import Literal, Dict, Any
from fastapi import UploadFile, File, Form
from app.services.validate import run_pipeline
from app.services.imaging import load_bgr  # <-- IMPORTANT: bytes -> BGR np.ndarray

# --- add this route after `router = APIRouter()` ---
@router.post("/ocr/test", tags=["debug"])
async def ocr_test(
    type: Literal["label", "angle"] = Form("label"),
    file: UploadFile = File(...),
) -> Dict[str, Any]:
    """
    Test OCR/validation from Swagger using the same run_pipeline(img, job_ctx, existing_phashes)
    path that /api/whatsapp/webhook uses. No DB/S3 writes.
    """
    # read file bytes
    data = await file.read()

    # decode to BGR image (numpy array)
    try:
        img = load_bgr(data)
        if img is None:
            return {"status": "FAIL", "reason": ["Could not decode image (None)"]}
    except Exception as e:
        return {"status": "FAIL", "reason": [f"Image decode error: {e}"]}

    # Map form type -> expectedType used by the pipeline
    expected = "LABEL" if type == "label" else "AZIMUTH"

    # Call your team’s pipeline with the correct signature
    result = run_pipeline(
        img,
        job_ctx={"expectedType": expected},   # thresholds can be added here if you want
        existing_phashes=[],                  # none for a standalone test
    )

    # Normalize a friendly response for Swagger (don’t change your pipeline)
    fields = result.get("fields") or {
        "macId": result.get("mac_id"),
        "rsn": result.get("rsn_id") or result.get("rsn"),
        "azimuthDeg": result.get("angleDeg"),
        "azimuthDir": result.get("angleDir"),
    }
    checks = result.get("checks") or {"blurScore": result.get("blurScore")}

    return {
        "type": result.get("type", expected),
        "status": result.get("status", "FAIL"),
        "reason": result.get("reason", []),
        "fields": fields,
        "checks": checks,
        "ocrText": result.get("ocrText"),
    }





def oid(obj):
    return str(obj["_id"]) if isinstance(obj.get("_id"), ObjectId) else obj.get("_id")

@router.get("/jobs", response_model=List[JobOut])
def list_jobs(db=Depends(get_db)):
    jobs_cursor = db.jobs.find().sort("createdAt", -1)
    jobs_list = []
    for j in jobs_cursor:
        jobs_list.append({
            "id": oid(j),
            "workerPhone": j["workerPhone"],
            "requiredTypes": j["requiredTypes"],
            "currentIndex": j["currentIndex"],
            "status": j["status"],
        })
    return jobs_list

@router.post("/jobs", response_model=JobOut)
def create_job(payload: CreateJob, db=Depends(get_db)):
    # --- 2. NORMALIZE THE PHONE NUMBER BEFORE SAVING ---
    normalized_phone = normalize_phone(payload.workerPhone)
    j = new_job(normalized_phone, payload.requiredTypes)
    # --- END OF CHANGE ---
    
    res = db.jobs.insert_one(j)
    j["_id"] = res.inserted_id
    return {
        "id": oid(j),
        "workerPhone": j["workerPhone"],
        "requiredTypes": j["requiredTypes"],
        "currentIndex": j["currentIndex"],
        "status": j["status"],
    }

@router.get("/jobs/{job_id}")
def get_job(job_id: str, db=Depends(get_db)):
    try:
        job = db.jobs.find_one({"_id": ObjectId(job_id)})
    except Exception:
        raise HTTPException(404, "Invalid Job ID format")
        
    if not job:
        raise HTTPException(404, "Job not found")
    photos = list(db.photos.find({"jobId": job_id}))
    items: List[PhotoOut] = []
    for p in photos:
        items.append({
            "id": oid(p),
            "jobId": p["jobId"],
            "type": p["type"],
            "s3Url": presign_url(p["s3Key"]),
            "fields": p.get("fields", {}),
            "checks": p.get("checks", {}),
            "status": p.get("status"),
            "reason": p.get("reason", []),
        })
    job["_id"] = oid(job)
    return {"job": job, "photos": items}

@router.get("/jobs/{job_id}/export.csv")
def export_csv(job_id: str, db=Depends(get_db)):
    try:
        job = db.jobs.find_one({"_id": ObjectId(job_id)})
    except Exception:
        raise HTTPException(404, "Invalid Job ID format")

    if not job:
        raise HTTPException(404, "Job not found")

    photos = list(db.photos.find({"jobId": job_id}))
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(["jobId","workerPhone","photoId","type","s3Key","macId","rsn","azimuthDeg","blurScore","isDuplicate","skewDeg","status","reason"])
    for p in photos:
        f = p.get("fields", {})
        c = p.get("checks", {})
        writer.writerow([
            job_id, job["workerPhone"], oid(p), p["type"], p["s3Key"],
            f.get("macId"), f.get("rsn"), f.get("azimuthDeg"),
            c.get("blurScore"), c.get("isDuplicate"), c.get("skewDeg"),
            p.get("status"), "|".join(p.get("reason", []))
        ])
    data = out.getvalue().encode("utf-8")
    headers = {
        "Content-Disposition": f'attachment; filename="job_{job_id}.csv"'
    }
    return Response(content=data, headers=headers, media_type="text/csv")


# --- NEW ENDPOINT ---
@router.get("/jobs/templates/sector/{sector}")
def job_template(sector: int):
    types = build_required_types_for_sector(sector)
    # Helpful for UIs: show both code and human label
    return {
        "requiredTypes": types,
        "labels": {t: type_label(t) for t in types},
        "sector": sector,
    }
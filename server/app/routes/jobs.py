from fastapi import APIRouter, Depends, HTTPException, Response
from bson import ObjectId
from typing import List
import csv, io
from fastapi.responses import StreamingResponse
from app.deps import get_db
from app.schemas import CreateJob, JobOut, PhotoOut
from app.models import new_job
from app.services.storage_s3 import presign_url
# New
from app.utils import normalize_phone, build_required_types_for_sector, type_label  # add

router = APIRouter()

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

@router.get("/jobs/{job_id}/export.zip")
def export_job_zip(job_id: str, db=Depends(get_db)):
    from fastapi.responses import StreamingResponse
    import io, os, zipfile
    import httpx
    from bson import ObjectId

    # validate id
    try:
        _id = ObjectId(job_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid job id")

    job = db.jobs.find_one({"_id": _id})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # ✅ support both string and ObjectId in photos.jobId
    photos = list(db.photos.find({"jobId": {"$in": [job_id, _id]}}))
    if not photos:
        # You can change this to return an empty zip if you prefer
        raise HTTPException(status_code=404, detail="No photos for this job")

    mem = io.BytesIO()
    with zipfile.ZipFile(mem, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for p in photos:
            ptype = (p.get("type") or "PHOTO").upper()
            fname = f"{ptype}_{str(p.get('_id'))}.jpg"

            # 1) local file
            lp = p.get("localPath")
            if lp and os.path.exists(lp):
                zf.write(lp, arcname=fname)
                continue

            # 2) URL (e.g., presigned s3Url stored in the doc)
            url = p.get("s3Url")
            if url:
                try:
                    # ✅ sync client in a sync route
                    with httpx.Client(timeout=20) as client:
                        r = client.get(url)
                        r.raise_for_status()
                        zf.writestr(fname, r.content)
                        continue
                except Exception:
                    pass

            # 3) mark missing
            zf.writestr(fname.replace(".jpg", "_MISSING.txt"), b"Missing image")

    mem.seek(0)
    return StreamingResponse(
        mem,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="job_{job_id}.zip"'},
    )


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
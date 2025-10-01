from fastapi import APIRouter, Depends, HTTPException, Response
from bson import ObjectId
from typing import List, Optional
import csv, io, os, zipfile
from fastapi.responses import StreamingResponse

from app.deps import get_db
from app.schemas import CreateJob, JobOut, PhotoOut
from app.models import new_job
from app.services.storage_s3 import presign_url
# New
from app.utils import normalize_phone, build_required_types_for_sector, type_label

router = APIRouter()


def oid(obj):
    return str(obj["_id"]) if isinstance(obj.get("_id"), ObjectId) else obj.get("_id")


# ------------------------------------------------------------
# LIST JOBS
# ------------------------------------------------------------
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
            "sector": j.get("sector"),
            # NEW:
            "macId": j.get("macId"),
            "rsnId": j.get("rsnId"),
            "azimuthDeg": j.get("azimuthDeg"),
        })
    return jobs_list


# ------------------------------------------------------------
# CREATE JOB
# ------------------------------------------------------------
@router.post("/jobs", response_model=JobOut)
def create_job(payload: CreateJob, db=Depends(get_db)):
    # Normalize phone
    normalized_phone = normalize_phone(payload.workerPhone)
    # Your factory already accepts sector
    j = new_job(normalized_phone, payload.requiredTypes, payload.sector)

    res = db.jobs.insert_one(j)
    j["_id"] = res.inserted_id
    return {
        "id": oid(j),
        "workerPhone": j["workerPhone"],
        "requiredTypes": j["requiredTypes"],
        "currentIndex": j["currentIndex"],
        "status": j["status"],
        "sector": j.get("sector"),
        # NEW (may be absent initially)
        "macId": j.get("macId"),
        "rsnId": j.get("rsnId"),
        "azimuthDeg": j.get("azimuthDeg"),
    }


# ------------------------------------------------------------
# GET JOB (detail + photos)
# ------------------------------------------------------------
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
        # presign now from key (works whether or not s3Url is stored)
        url = p.get("s3Url") or presign_url(p["s3Key"])
        items.append({
            "id": oid(p),
            "jobId": p["jobId"],
            "type": p["type"],
            "s3Url": url,
            "fields": p.get("fields", {}),
            "checks": p.get("checks", {}),
            "status": p.get("status"),
            "reason": p.get("reason", []),
        })

    # Build a clean job dict for UI (string id + new fields)
    job_out = {
        "id": oid(job),
        "workerPhone": job["workerPhone"],
        "requiredTypes": job["requiredTypes"],
        "currentIndex": job["currentIndex"],
        "status": job["status"],
        "sector": job.get("sector"),
        "macId": job.get("macId"),
        "rsnId": job.get("rsnId"),
        "azimuthDeg": job.get("azimuthDeg"),
    }
    return {"job": job_out, "photos": items}


# ------------------------------------------------------------
# PER-JOB CSV (photo-level rows, already had fields)
# ------------------------------------------------------------
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
    writer.writerow([
        "jobId","workerPhone","photoId","type","s3Key",
        "macId","rsn","azimuthDeg",
        "blurScore","isDuplicate","skewDeg","hasLabelIds",
        "status","reason"
    ])
    for p in photos:
        f = p.get("fields", {})
        c = p.get("checks", {})
        writer.writerow([
            job_id,
            job["workerPhone"],
            oid(p),
            p["type"],
            p["s3Key"],
            f.get("macId"),
            f.get("rsn"),
            f.get("azimuthDeg"),
            c.get("blurScore"),
            c.get("isDuplicate"),
            c.get("skewDeg"),
            c.get("hasLabelIds"),
            p.get("status"),
            "|".join(p.get("reason", [])),
        ])
    data = out.getvalue().encode("utf-8")
    headers = {"Content-Disposition": f'attachment; filename="job_{job_id}.csv"'}
    return Response(content=data, headers=headers, media_type="text/csv")


# ------------------------------------------------------------
# NEW: ALL JOBS CSV (job-level summary with MAC/RSN/Azimuth)
# ------------------------------------------------------------
@router.get("/jobs/export.csv")
def export_jobs_csv(db=Depends(get_db)):
    out = io.StringIO()
    writer = csv.writer(out)

    headers = [
        "Job ID", "Worker", "Sector", "Status",
        "MAC ID", "RSN ID", "Azimuth (deg)",
        "Created At", "Updated At",
    ]
    writer.writerow(headers)

    cur = db.jobs.find().sort("createdAt", -1)
    for job in cur:
        mac = job.get("macId") or ""
        rsn = job.get("rsnId") or ""
        az  = job.get("azimuthDeg")
        az  = f"{az:.1f}" if isinstance(az, (int, float)) else ""

        # Fallback: latest LABELLING photo if missing
        if not mac or not rsn:
            lab = db.photos.find_one(
                {"jobId": str(job["_id"]), "type": "LABELLING"},
                sort=[("_id", -1)]
            )
            if lab:
                f = lab.get("fields") or {}
                mac = mac or f.get("macId", "")
                rsn = rsn or f.get("rsn", "")

        row = [
            str(job["_id"]),
            job.get("workerPhone", ""),
            job.get("sector", ""),
            job.get("status", ""),
            mac, rsn, az,
            job.get("createdAt", ""),
            job.get("updatedAt", ""),
        ]
        writer.writerow(row)

    return Response(
        content=out.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="jobs.csv"'},
    )



# NEW
# --- XLSX (no images) ---
from io import BytesIO
from openpyxl import Workbook

@router.get("/jobs/{job_id}/export.xlsx")
def export_xlsx(job_id: str, db=Depends(get_db)):
    try:
        job = db.jobs.find_one({"_id": ObjectId(job_id)})
    except Exception:
        raise HTTPException(404, "Invalid Job ID format")
    if not job:
        raise HTTPException(404, "Job not found")

    photos = list(db.photos.find({"jobId": job_id}))

    wb = Workbook()
    ws = wb.active
    ws.title = "Photos"

    headers = [
        "jobId","workerPhone","photoId","type","s3Key",
        "macId","rsn","azimuthDeg",
        "blurScore","isDuplicate","skewDeg","hasLabelIds",
        "status","reason"
    ]
    ws.append(headers)

    for p in photos:
        f = p.get("fields", {})
        c = p.get("checks", {})
        ws.append([
            job_id,
            job.get("workerPhone", ""),
            oid(p),
            p.get("type", ""),
            p.get("s3Key", ""),
            f.get("macId", ""),
            f.get("rsn", ""),
            f.get("azimuthDeg", ""),
            c.get("blurScore", ""),
            c.get("isDuplicate", ""),
            c.get("skewDeg", ""),
            c.get("hasLabelIds", ""),
            p.get("status", ""),
            "|".join(p.get("reason", [])),
        ])

    out = BytesIO()
    wb.save(out)
    out.seek(0)
    return Response(
        content=out.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="job_{job_id}.xlsx"'},
    )

# --- XLSX (with embedded thumbnails) ---
from openpyxl.drawing.image import Image as XLImage
import httpx
from PIL import Image as PILImage
import tempfile

@router.get("/jobs/{job_id}/export_with_images.xlsx")
def export_xlsx_with_images(job_id: str, db=Depends(get_db)):
    try:
        job = db.jobs.find_one({"_id": ObjectId(job_id)})
    except Exception:
        raise HTTPException(404, "Invalid Job ID format")
    if not job:
        raise HTTPException(404, "Job not found")

    photos = list(db.photos.find({"jobId": job_id}))

    wb = Workbook()
    ws = wb.active
    ws.title = "Photos"

    headers = [
        "jobId","workerPhone","photoId","type","macId","rsn","azimuthDeg",
        "blurScore","isDuplicate","skewDeg","hasLabelIds","status","reason","thumbnail"
    ]
    ws.append(headers)

    # set a reasonable row height & column width for thumbnails
    ws.column_dimensions["M"].width = 28  # thumbnail column
    thumb_max = 160  # pixels

    for idx, p in enumerate(photos, start=2):
        f = p.get("fields", {})
        c = p.get("checks", {})
        ws.append([
            job_id,
            job.get("workerPhone", ""),
            oid(p),
            p.get("type", ""),
            f.get("macId", ""),
            f.get("rsn", ""),
            f.get("azimuthDeg", ""),
            c.get("blurScore", ""),
            c.get("isDuplicate", ""),
            c.get("skewDeg", ""),
            c.get("hasLabelIds", ""),
            p.get("status", ""),
            "|".join(p.get("reason", [])),
            "",  # thumbnail placeholder in column M
        ])

        # fetch the image via presigned URL and embed a small thumbnail
        key = p.get("s3Key")
        url = p.get("s3Url") or (presign_url(key) if key else None)
        if not url:
            continue
        try:
            with httpx.Client(timeout=20) as client:
                r = client.get(url)
                r.raise_for_status()
                # create temp thumbnail file for openpyxl
                with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
                    img = PILImage.open(io.BytesIO(r.content)).convert("RGB")
                    img.thumbnail((thumb_max, thumb_max))
                    img.save(tmp.name, "JPEG", quality=80)
                    xlimg = XLImage(tmp.name)
                    # place into column M (13)
                    cell_ref = f"M{idx}"
                    ws.add_image(xlimg, cell_ref)
        except Exception:
            # skip embedding on fetch/convert errors
            pass

    out = BytesIO()
    wb.save(out)
    out.seek(0)
    return Response(
        content=out.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="job_{job_id}_with_images.xlsx"'},
    )




# ------------------------------------------------------------
# JOB ZIP (images) — presign keys if needed
# ------------------------------------------------------------
@router.get("/jobs/{job_id}/export.zip")
def export_job_zip(job_id: str, db=Depends(get_db)):
    # validate id
    try:
        _id = ObjectId(job_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid job id")

    job = db.jobs.find_one({"_id": _id})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # support both string and ObjectId in photos.jobId
    photos = list(db.photos.find({"jobId": {"$in": [job_id, _id]}}))
    if not photos:
        raise HTTPException(status_code=404, detail="No photos for this job")

    mem = io.BytesIO()
    with zipfile.ZipFile(mem, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for p in photos:
            ptype = (p.get("type") or "PHOTO").upper()
            fname = f"{ptype}_{str(p.get('_id'))}.jpg"

            # 1) local file path (if you store it)
            lp = p.get("localPath")
            if lp and os.path.exists(lp):
                zf.write(lp, arcname=fname)
                continue

            # 2) presigned URL from key (works even if s3Url absent)
            key = p.get("s3Key")
            url = p.get("s3Url") or (presign_url(key) if key else None)
            if url:
                try:
                    # small, safe sync fetch
                    import httpx
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


# ------------------------------------------------------------
# TEMPLATE for sector (unchanged semantics)
# ------------------------------------------------------------
@router.get("/jobs/templates/sector/{sector}")
def job_template(sector: int):
    types = build_required_types_for_sector(sector)
    # Helpful for UIs: show both code and human label
    return {
        "requiredTypes": types,
        "labels": {t: type_label(t) for t in types},
        "sector": sector,
    }

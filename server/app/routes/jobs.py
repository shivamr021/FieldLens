from fastapi import APIRouter, Depends, HTTPException, Response
from bson import ObjectId
from typing import List
import csv, io
from fastapi.responses import StreamingResponse
from app.deps import get_db
from app.schemas import CreateJob, JobOut, PhotoOut
from app.models import new_job
from app.services.storage_s3 import presign_url, get_bytes
# New
from app.utils import normalize_phone, build_required_types_for_sector, type_label  # add
from openpyxl import Workbook
from openpyxl.drawing.image import Image as XLImage
from openpyxl.utils import get_column_letter
from PIL import Image as PILImage
from io import BytesIO
import os, zipfile
import httpx


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
    j = new_job(normalized_phone, payload.requiredTypes, payload.sector) # pass sector
    # --- END OF CHANGE ---
    
    res = db.jobs.insert_one(j)
    j["_id"] = res.inserted_id
    return {
        "id": oid(j),
        "workerPhone": j["workerPhone"],
        "requiredTypes": j["requiredTypes"],
        "currentIndex": j["currentIndex"],
        "status": j["status"],
        "sector": j.get("sector"),   # include sector in response
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

    writer.writerow([
        "jobId","workerPhone","photoId","type","s3Key","logicalName",  # <-- add
        "macId","rsn","azimuthDeg","blurScore","isDuplicate","skewDeg","status","reason"
    ])

    for p in photos:
        f = p.get("fields", {})
        c = p.get("checks", {})
        logical = f"sec{job.get('sector')}_{p['type'].lower()}.jpg" if job.get('sector') else f"{p['type'].lower()}.jpg"
        writer.writerow([
            job_id, job["workerPhone"], oid(p), p["type"], p["s3Key"], logical,
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


# NEW: /jobs/{job_id}/export.xlsx
@router.get("/jobs/{job_id}/export.xlsx")
def export_xlsx(job_id: str, db=Depends(get_db)):
    try:
        job = db.jobs.find_one({"_id": ObjectId(job_id)})
    except Exception:
        raise HTTPException(404, "Invalid Job ID format")
    if not job:
        raise HTTPException(404, "Job not found")

    photos = list(db.photos.find({"jobId": job_id}))
    rows = []
    for p in photos:
        f = p.get("fields", {})
        c = p.get("checks", {})
        sector = job.get("sector")
        base = p["type"].lower()
        logical = f"sec{sector}_{base}.jpg" if sector else f"{base}.jpg"
        rows.append({
            "jobId": job_id,
            "workerPhone": job["workerPhone"],
            "photoId": str(p.get("_id")),
            "type": p["type"],
            "s3Key": p["s3Key"],
            "logicalName": logical,
            "macId": f.get("macId"),
            "rsn": f.get("rsn"),
            "azimuthDeg": f.get("azimuthDeg"),
            "blurScore": c.get("blurScore"),
            "isDuplicate": c.get("isDuplicate"),
            "skewDeg": c.get("skewDeg"),
            "status": p.get("status"),
            "reason": "|".join(p.get("reason", [])),
        })

    # build xlsx in-memory (no disk writes)
    import pandas as pd, io
    buf = io.BytesIO()
    pd.DataFrame(rows).to_excel(buf, index=False)
    data = buf.getvalue()
    headers = {"Content-Disposition": f'attachment; filename="job_{job_id}.xlsx"'}
    return Response(content=data, headers=headers, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")


@router.get("/jobs/{job_id}/export_with_images.xlsx")
def export_with_images(job_id: str, db=Depends(get_db)):
    # --- Fetch job ---
    try:
        job = db.jobs.find_one({"_id": ObjectId(job_id)})
    except Exception:
        raise HTTPException(404, "Invalid Job ID format")
    if not job:
        raise HTTPException(404, "Job not found")

    # --- Fetch photos for job ---
    photos = list(db.photos.find({"jobId": job_id}))
    sector = job.get("sector")

    # --- Build workbook ---
    wb = Workbook()
    ws = wb.active
    ws.title = "Photos"

    # Header
    headers = [
        "jobId","workerPhone","photoId","type","s3Key","logicalName",
        "macId","rsn","azimuthDeg","blurScore","isDuplicate","skewDeg",
        "status","reason","photo"  # last col = embedded image
    ]
    ws.append(headers)

    # Set column widths (optional, tweak to taste)
    widths = {
        "A": 25, "B": 20, "C": 30, "D": 18, "E": 45, "F": 28,
        "G": 16, "H": 16, "I": 12, "J": 12, "K": 12, "L": 12,
        "M": 12, "N": 30, "O": 18
    }
    for col, w in widths.items():
        ws.column_dimensions[col].width = w

    row_index = 2  # data starts at row 2
    thumb_max_w, thumb_max_h = 160, 160  # px, adjust as needed

    for p in photos:
        f = p.get("fields", {})
        c = p.get("checks", {})
        base = p["type"].lower()
        logical = f"sec{sector}_{base}.jpg" if sector else f"{base}.jpg"

        reason = "|".join(p.get("reason", []))

        row = [
            job_id,
            job["workerPhone"],
            oid(p),
            p["type"],
            p["s3Key"],
            logical,
            f.get("macId"),
            f.get("rsn"),
            f.get("azimuthDeg"),
            c.get("blurScore"),
            c.get("isDuplicate"),
            c.get("skewDeg"),
            p.get("status"),
            reason,
            ""  # placeholder for image column
        ]
        ws.append(row)

        # Try embedding image
        try:
            raw = get_bytes(p["s3Key"])
            pil = PILImage.open(BytesIO(raw)).convert("RGB")
            pil.thumbnail((thumb_max_w, thumb_max_h))  # keeps aspect ratio

            buf = BytesIO()
            pil.save(buf, format="JPEG", quality=85)
            buf.seek(0)

            xl_img = XLImage(buf)
            img_cell = f"O{row_index}"  # column O = "photo"
            ws.add_image(xl_img, img_cell)

            # Make the row taller to fit the thumbnail (rough px-to-points mapping)
            ws.row_dimensions[row_index].height = 130  # tweak if needed
        except Exception as e:
            # If embed fails, just leave the cell blank; data columns still export
            pass

        row_index += 1

    # Stream workbook
    out = BytesIO()
    wb.save(out)
    data = out.getvalue()
    headers = {"Content-Disposition": f'attachment; filename="job_{job_id}_with_images.xlsx"'}
    return Response(content=data, headers=headers,
                    media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")


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

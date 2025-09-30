import os, csv, io
from typing import List, Dict

EXPORT_DIR = os.getenv("LOCAL_STORAGE_DIR", "./_local_uploads")
EXPORT_DIR = os.path.join(EXPORT_DIR, "exports")
os.makedirs(EXPORT_DIR, exist_ok=True)

def write_job_csv(job: Dict, photos: List[Dict]) -> str:
    job_id = str(job["_id"])
    path = os.path.join(EXPORT_DIR, f"job_{job_id}.csv")
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow([
            "jobId","workerPhone","photoId","type","s3Key","logicalName",
            "macId","rsn","azimuthDeg","blurScore","isDuplicate","skewDeg","status","reason"
        ])
        for p in photos:
            flds, chks = p.get("fields", {}), p.get("checks", {})
            sector = job.get("sector")
            base = p["type"].lower()
            logical = f"sec{sector}_{base}.jpg" if sector else f"{base}.jpg"
            writer.writerow([
                job_id, job["workerPhone"], str(p.get("_id")), p["type"], p["s3Key"], logical,
                flds.get("macId"), flds.get("rsn"), flds.get("azimuthDeg"),
                chks.get("blurScore"), chks.get("isDuplicate"), chks.get("skewDeg"),
                p.get("status"), "|".join(p.get("reason", []))
            ])
    # This will be served at /uploads/exports/<file>
    return f"/uploads/exports/job_{job_id}.csv"

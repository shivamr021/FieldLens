from typing import List, Optional, Literal, Dict, Any
from datetime import datetime

# Mongo “documents” (runtime dicts) – not Pydantic models.

JobStatus = Literal["PENDING", "IN_PROGRESS", "DONE"]
PhotoType = str
PhotoStatus = Literal["PASS", "FAIL"]


def new_job(worker_phone: str, required_types: List[PhotoType], sector: int):
    return {
        "workerPhone": worker_phone,
        "requiredTypes": required_types,
        "currentIndex": 0,
        "status": "PENDING",
        "sector": sector,   
        "createdAt": datetime.utcnow(),
        "updatedAt": datetime.utcnow(),
    }


def new_photo(job_id: str, ptype: PhotoType, s3_key: str):
    return {
        "jobId": job_id,
        "type": ptype,
        "s3Key": s3_key,
        "phash": None,
        "ocrText": "",
        "fields": {},
        "checks": {
            "blurScore": None,
            "isDuplicate": False,
            "skewDeg": None
        },
        "status": None,
        "reason": [],
        "createdAt": datetime.utcnow(),
    }

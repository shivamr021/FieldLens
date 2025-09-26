from pydantic import BaseModel, Field
from typing import List, Optional, Literal, Dict, Any

PhotoType = str


class CreateJob(BaseModel):
    workerPhone: str
    requiredTypes: List[PhotoType] = Field(default_factory=lambda: ["LABEL", "AZIMUTH"])


class JobOut(BaseModel):
    id: str
    workerPhone: str
    requiredTypes: List[PhotoType]
    currentIndex: int
    status: str


class PhotoOut(BaseModel):
    id: str
    jobId: str
    type: PhotoType
    s3Url: str
    fields: Dict[str, Any]
    checks: Dict[str, Any]
    status: str
    reason: List[str]

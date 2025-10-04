from pydantic import BaseModel, Field
from typing import List, Optional, Literal, Dict, Any

PhotoType = str

DEFAULT_14 = [
    "INSTALLATION", "CLUTTER", "AZIMUTH", "A6_GROUNDING", "CPRI_GROUNDING",
    "POWER_TERM_A6", "CPRI_TERM_A6", "TILT", "LABELLING", "ROXTEC", "A6_PANEL",
    "MCB_POWER", "CPRI_TERM_SWITCH_CSS", "GROUNDING_OGB_TOWER"
]

class CreateJob(BaseModel):
    workerPhone: str
    requiredTypes: List[PhotoType] = Field(default_factory=lambda: DEFAULT_14)
    sector: Optional[int] = None


class JobOut(BaseModel):
    id: str
    workerPhone: str
    requiredTypes: List[PhotoType]
    currentIndex: int
    status: str
    # Optional but handy for admin UI
    sector: Optional[int] = None     # <-- NEW
    # --- NEW fields for UI/export ---
    macId: Optional[str] = None
    rsnId: Optional[str] = None
    azimuthDeg: Optional[float] = None

class PhotoOut(BaseModel):
    id: str
    jobId: str
    type: PhotoType
    s3Url: str
    fields: Dict[str, Any]
    checks: Dict[str, Any]
    status: str
    reason: List[str]

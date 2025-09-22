import os
import re

from dotenv import load_dotenv

load_dotenv()

APP_BASE_URL = os.getenv("APP_BASE_URL", "http://localhost:8000")
EXAMPLE_URL_LABEL = os.getenv("PUBLIC_EXAMPLE_URL_LABEL", "https://via.placeholder.com/600x400?text=Label+Example")
EXAMPLE_URL_AZIMUTH = os.getenv("PUBLIC_EXAMPLE_URL_AZIMUTH", "https://via.placeholder.com/600x400?text=Azimuth+Example")


def normalize_phone(p: str) -> str:
    if not p:
        return p
    return p.strip()


DEGREE_RE = re.compile(r"(?<!\d)([0-3]?\d{1,2})(?:\s*(?:°|deg|degrees)?)\b", re.IGNORECASE)
MAC_RE = re.compile(r"\b([0-9A-F]{12})\b", re.IGNORECASE)
RSN_RE = re.compile(r"\b(RSN|SR|SN)[:\s\-]*([A-Z0-9\-]{4,})\b", re.IGNORECASE)

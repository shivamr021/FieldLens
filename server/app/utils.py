# app/utils.py
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

# --- Canonical type mapping used across the app ---
_TYPE_ALIASES = {
    "label": "LABEL",
    "labelling": "LABEL",
    "labeling": "LABEL",
    "angle": "AZIMUTH",
    "azimuth": "AZIMUTH",
    "azi": "AZIMUTH",
}

def canonical_type(ptype: str | None) -> str:
    if not ptype:
        return "PHOTO"
    k = str(ptype).strip().lower()
    return _TYPE_ALIASES.get(k, k.upper())


def type_label(ptype: str | None) -> str:
    """
    Human-friendly label for a canonical type.
    """
    c = canonical_type(ptype)
    if c == "LABEL":
        return "Label Photo"
    if c == "AZIMUTH":
        return "Azimuth Photo"
    return c.title()


def build_required_types_for_sector(sector: str | None) -> list[str]:
    """
    Return the ordered list of required types for a given 'sector' (project/workflow).
    Adjust the mapping to match your org. We provide safe defaults so the app runs.
    """
    if not sector:
        return ["LABEL", "AZIMUTH"]

    s = str(sector).strip().upper()

    # >>> Customize this mapping as your team needs <<<
    mapping = {
        # Fixed Wireless Access examples
        "FWA": ["LABEL", "AZIMUTH"],
        "WIRELESS": ["LABEL", "AZIMUTH"],

        # Fiber examples (placeholder; extend as needed)
        "FTTH": ["LABEL"],      # e.g., only label for now
        "FIBER": ["LABEL"],

        # Default fallback
        "DEFAULT": ["LABEL", "AZIMUTH"],
    }

    return mapping.get(s, mapping["DEFAULT"])


# ------------------ ADDED: helpers used by whatsapp.py ------------------

def is_validated_type(ptype: str | None) -> bool:
    """
    Whether this type should go through OCR/validation.
    """
    return canonical_type(ptype) in {"LABEL", "AZIMUTH"}


def type_example_url(ptype: str | None) -> str:
    """
    Example image URL to include in WhatsApp replies.
    Uses env-configured PUBLIC_EXAMPLE_URL_* if provided.
    """
    c = canonical_type(ptype)
    if c == "AZIMUTH":
        return EXAMPLE_URL_AZIMUTH
    return EXAMPLE_URL_LABEL


def type_prompt(ptype: str | None) -> str:
    """
    Short instruction shown to workers on WhatsApp for the expected photo type.
    """
    c = canonical_type(ptype)
    if c == "AZIMUTH":
        return "Please send the **Azimuth Photo** showing a clear compass reading (e.g., 123° NE)."
    # default to label
    return "Please send the **Label Photo** with MAC & RSN clearly visible (flat, sharp, no glare)."

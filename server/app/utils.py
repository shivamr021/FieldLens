import os
import re
from dotenv import load_dotenv
from twilio.rest import Client

load_dotenv()

# --- Environment Variables ---
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
TWILIO_WHATSAPP_FROM = os.getenv("TWILIO_WHATSAPP_FROM")


APP_BASE_URL = os.getenv("APP_BASE_URL")
if not APP_BASE_URL:
    raise ValueError("APP_BASE_URL not set in .env")

# --- Photo Type Catalog (configurable) ---
# Canonical codes drive logic; labels + examples drive UX.
# Put example images in: app/static/examples/<code>.jpeg  (override with env if you want)
def _sanitize_example_url(u: str | None) -> str:
    """Fix common typos or misconfigs in example URLs."""
    if not u:
        return ""
    # Correct the common '.jped' mistake and normalize basic spacing
    u = u.replace(".jped", ".jpeg")
    return u

TYPE_REGISTRY = {
    "INSTALLATION": {
        "label": "Installation",
        "prompt": "Send the *Installation* photo (full view, well lit).",
        "example_env": "PUBLIC_EXAMPLE_URL_INSTALLATION",
        "example_default": f"{APP_BASE_URL}/static/examples/installation.jpeg",
        "validated": False,
    },
    "CLUTTER": {
        "label": "Clutter",
        "prompt": "Send the *Clutter* photo (surroundings, wide frame).",
        "example_env": "PUBLIC_EXAMPLE_URL_CLUTTER",
        "example_default": f"{APP_BASE_URL}/static/examples/clutter.jpeg",
        "validated": False,
    },
    "AZIMUTH": {
        "label": "Azimuth Photo",
        "prompt": "Please send the *Azimuth Photo* with a clear compass reading.",
        "example_env": "PUBLIC_EXAMPLE_URL_AZIMUTH",
        "example_default": f"{APP_BASE_URL}/static/examples/azimuth.jpeg",
        "validated": False,
    },
    "A6_GROUNDING": {
        "label": "A6 Grounding",
        "prompt": "Send *A6 Grounding* photo (clear lugs & conductor).",
        "example_env": "PUBLIC_EXAMPLE_URL_A6_GROUNDING",
        "example_default": f"{APP_BASE_URL}/static/examples/a6_grounding.jpeg",
        "validated": False,
    },
    "CPRI_GROUNDING": {
        "label": "CPRI Grounding",
        "prompt": "Send *CPRI Grounding* photo (bond points visible).",
        "example_env": "PUBLIC_EXAMPLE_URL_CPRI_GROUNDING",
        "example_default": f"{APP_BASE_URL}/static/examples/cpri_grounding.jpeg",
        "validated": False,
    },
    "POWER_TERM_A6": {
        "label": "POWER Termination at A6",
        "prompt": "Send *POWER Termination at A6* close-up (no glare).",
        "example_env": "PUBLIC_EXAMPLE_URL_POWER_TERM_A6",
        "example_default": f"{APP_BASE_URL}/static/examples/power_term_a6.jpeg",
        "validated": False,
    },
    "CPRI_TERM_A6": {
        "label": "CPRI Termination at A6",
        "prompt": "Send *CPRI Termination at A6* (connector seated).",
        "example_env": "PUBLIC_EXAMPLE_URL_CPRI_TERM_A6",
        "example_default": f"{APP_BASE_URL}/static/examples/cpri_term_a6.jpeg",
        "validated": False,
    },
    "TILT": {
        "label": "Tilt",
        "prompt": "Send *Tilt* photo (tilt setting clearly visible).",
        "example_env": "PUBLIC_EXAMPLE_URL_TILT",
        "example_default": f"{APP_BASE_URL}/static/examples/tilt.jpeg",
        "validated": False,
    },
    "LABELLING": {
        "label": "Labelling",
        "prompt": "Send *Labelling* photo (all labels readable).",
        "example_env": "PUBLIC_EXAMPLE_URL_LABELLING",
        "example_default": f"{APP_BASE_URL}/static/examples/labelling.jpeg",
        "validated": False,
    },
    "ROXTEC": {
        "label": "Roxtec",
        "prompt": "Send *Roxtec* sealing photo (modules visible).",
        "example_env": "PUBLIC_EXAMPLE_URL_ROXTEC",
        "example_default": f"{APP_BASE_URL}/static/examples/roxtec.jpeg",
        "validated": False,
    },
    "A6_PANEL": {
        "label": "A6 Panel",
        "prompt": "Send *A6 Panel* photo (panel overview).",
        "example_env": "PUBLIC_EXAMPLE_URL_A6_PANEL",
        "example_default": f"{APP_BASE_URL}/static/examples/a6_panel.jpeg",
        "validated": False,
    },
    "MCB_POWER": {
        "label": "MCB Power",
        "prompt": "Send *MCB Power* photo (breaker & rating visible).",
        "example_env": "PUBLIC_EXAMPLE_URL_MCB_POWER",
        "example_default": f"{APP_BASE_URL}/static/examples/mcb_power.jpeg",
        "validated": False,
    },
    "CPRI_TERM_SWITCH_CSS": {
        "label": "CPRI Termination at Switch-CSS",
        "prompt": "Send *CPRI Termination at Switch-CSS* photo.",
        "example_env": "PUBLIC_EXAMPLE_URL_CPRI_TERM_SWITCH_CSS",
        "example_default": f"{APP_BASE_URL}/static/examples/cpri_term_switch_css.jpeg",
        "validated": False,
    },
    "GROUNDING_OGB_TOWER": {
        "label": "Grounding at OGB Tower",
        "prompt": "Send *Grounding at OGB Tower* photo (bonding clear).",
        "example_env": "PUBLIC_EXAMPLE_URL_GROUNDING_OGB_TOWER",
        "example_default": f"{APP_BASE_URL}/static/examples/grounding_ogb_tower.jpeg",
        "validated": False,
    },
}

def type_label(ptype: str) -> str:
    return TYPE_REGISTRY.get(ptype, {}).get("label", ptype.replace("_", " ").title())

def type_example_url(ptype: str) -> str:
    meta = TYPE_REGISTRY.get(ptype, {})
    env_key = meta.get("example_env")
    # Prefer ENV if set; otherwise default pattern
    raw = (os.getenv(env_key) if env_key else None) or meta.get(
        "example_default",
        f"{APP_BASE_URL}/static/examples/{ptype.lower()}.jpeg",
    )
    return _sanitize_example_url(raw)

def type_prompt(ptype: str) -> str:
    return TYPE_REGISTRY.get(ptype, {}).get("prompt", f"Please send the *{type_label(ptype)}* photo.")

def is_validated_type(ptype: str) -> bool:
    return TYPE_REGISTRY.get(ptype, {}).get("validated", False)

# 14-step default template (sector-aware naming is visual; canonical codes keep logic stable)
DEFAULT_14_TYPES = [
    "INSTALLATION",
    "CLUTTER",
    "AZIMUTH",
    "A6_GROUNDING",
    "CPRI_GROUNDING",
    "POWER_TERM_A6",
    "CPRI_TERM_A6",
    "TILT",
    "LABELLING",
    "ROXTEC",
    "A6_PANEL",
    "MCB_POWER",
    "CPRI_TERM_SWITCH_CSS",
    "GROUNDING_OGB_TOWER",
]

def build_required_types_for_sector(sector: int) -> list[str]:
    # Admin sees "Sec{sector}_<Label>" in UI exports, but we keep canonical codes in DB.
    return DEFAULT_14_TYPES


# --- Twilio Client (used for outbound/push messages) ---
twilio_client = None
if TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN:
    twilio_client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)


# --- Helper Functions ---
def normalize_phone(p: str) -> str:
    """Normalize incoming Twilio phone params to canonical 'whatsapp:+<E.164>'."""
    if not p:
        return ""
    digits = re.sub(r'\D', '', p)
    return f"whatsapp:+{digits}" if digits else ""


def send_whatsapp_image(to_number: str, image_url: str, text: str = ""):
    """Sends an image to WhatsApp using Twilio REST API."""
    if not all([twilio_client, TWILIO_WHATSAPP_FROM]):
        print("[ERROR] Twilio REST client not configured in .env.")
        return None

    if to_number and not to_number.startswith("whatsapp:"):
        to_number = f"whatsapp:{to_number}"

    try:
        message = twilio_client.messages.create(
            from_=TWILIO_WHATSAPP_FROM,
            to=to_number,
            body=text,
            media_url=[image_url]
        )
        print(f"[INFO] Sent example image to {to_number}, SID={message.sid}")
        return message.sid
    except Exception as e:
        print(f"[ERROR] Failed to send WhatsApp image via REST API: {e}")
        return None


# --- Regex ---
DEGREE_RE = re.compile(r"(?<!\d)([0-3]?\d{1,2})(?:\s*(?:°|deg|degrees)?)\b", re.IGNORECASE)
MAC_RE = re.compile(r"\b([0-9A-F]{12})\b", re.IGNORECASE)
RSN_RE = re.compile(r"\b(RSN|SR|SN)[:\s\-]*([A-Z0-9\-]{4,})\b", re.IGNORECASE)

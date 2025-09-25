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

EXAMPLE_URL_LABEL = os.getenv("PUBLIC_EXAMPLE_URL_LABEL") or f"{APP_BASE_URL}/static/label-example.jpg"
EXAMPLE_URL_AZIMUTH = os.getenv("PUBLIC_EXAMPLE_URL_AZIMUTH") or f"{APP_BASE_URL}/static/azimuth-example.jpeg"


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

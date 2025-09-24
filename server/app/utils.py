import os
import re

APP_BASE_URL = os.getenv("APP_BASE_URL", "http://localhost:8000")

# These public URLs are used to send the example images.
EXAMPLE_URL_LABEL = os.getenv(
    "PUBLIC_EXAMPLE_URL_LABEL",
    "https://placehold.co/600x400/334155/e2e8f0?text=Label+Example"
)
EXAMPLE_URL_AZIMUTH = os.getenv(
    "PUBLIC_EXAMPLE_URL_AZIMUTH",
    "https://placehold.co/600x400/334155/e2e8f0?text=Azimuth+Example"
)

def normalize_phone(p: str) -> str:
    if not p:
        return ""
    digits = re.sub(r'\D', '', p)
    if not digits:
        return ""
    return f"whatsapp:+{digits}"

DEGREE_RE = re.compile(r"(?<!\d)([0-3]?\d{1,2})(?:\s*(?:°|deg|degrees)?)\b", re.IGNORECASE)
MAC_RE = re.compile(r"\b([0-9A-F]{12})\b", re.IGNORECASE)
RSN_RE = re.compile(r"\b(RSN|SR|SN)[:\s\-]*([A-Z0-9\-]{4,})\b", re.IGNORECASE)

# ------------------- TWILIO IMAGE FUNCTION -------------------
from twilio.rest import Client

TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
TWILIO_WHATSAPP_FROM = os.getenv("TWILIO_WHATSAPP_FROM", "whatsapp:+14155238886")  # sandbox number

twilio_client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)

def send_whatsapp_image(to_number: str, image_url: str, text: str = ""):
    """
    Sends an image to WhatsApp in a separate message (after text reply).
    """
    if not to_number.startswith("whatsapp:"):
        to_number = f"whatsapp:{to_number}"
    try:
        message = twilio_client.messages.create(
            from_=TWILIO_WHATSAPP_FROM,
            to=to_number,
            body=text,              # optional caption
            media_url=[image_url]   # must be list
        )
        print(f"[INFO] Sent image to {to_number}, SID={message.sid}")
        return message.sid
    except Exception as e:
        print(f"[ERROR] Failed to send WhatsApp image: {e}")
        return None

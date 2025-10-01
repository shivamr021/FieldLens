import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.routes import jobs, whatsapp,auth
from typing import Any
from app.services.ocr import _easyocr  # lazy loader you already have

LOCAL_STORAGE_DIR = os.getenv("LOCAL_STORAGE_DIR", "./_local_uploads")
os.makedirs(LOCAL_STORAGE_DIR, exist_ok=True)

app = FastAPI(title="Photo Verify API", version="1.0")

# warm up EasyOCR once (non-blocking if already cached)
@app.on_event("startup")
def _warmup_ocr():
    try:
        _ = _easyocr()  # triggers model load on process start
        print("[OCR] EasyOCR reader is warmed up.")
    except Exception as e:
        print("[OCR] Warmup failed (will lazy-load later):", repr(e))
        

PROD_DOMAIN = os.getenv("VERCEL_PROD_DOMAIN", "field-lens.vercel.app")  # change if you use a custom domain
# Optional custom web domain if you later map one (e.g., app.yourdomain.com)
CUSTOM_WEB_DOMAIN = os.getenv("WEB_APP_DOMAIN")  # optional

# Local dev origins
LOCAL_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
]

# Exact origins we always allow
EXACT_ORIGINS = set(LOCAL_ORIGINS + [f"https://{PROD_DOMAIN}"])
if CUSTOM_WEB_DOMAIN:
    EXACT_ORIGINS.add(f"https://{CUSTOM_WEB_DOMAIN}")

# Regex for ALL Vercel preview deployments, e.g.
#   https://field-lens-git-master-<user>.vercel.app
#   https://some-branch-some-hash.vercel.app
VERCEL_REGEX = r"^https://([a-z0-9-]+\.)*vercel\.app$"

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(EXACT_ORIGINS),       # must be specific when using credentials
    allow_origin_regex=VERCEL_REGEX,         # allow any *.vercel.app previews
    allow_credentials=True,                  # enables cookies / withCredentials
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With"],
    expose_headers=["Content-Disposition"],  # useful for downloads
)

# Mounts
app.mount("/uploads", StaticFiles(directory=LOCAL_STORAGE_DIR), name="uploads")
app.mount("/static", StaticFiles(directory="app/static"), name="static")
app.mount("/admin", StaticFiles(directory="admin", html=True), name="admin")

# Routers
app.include_router(jobs.router, prefix="/api", tags=["jobs"])
app.include_router(whatsapp.router, prefix="/api", tags=["whatsapp"])
app.include_router(auth.router, prefix="/api", tags=["auth"])

# Health & root
@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/")
def root():
    return {"ok": True, "docs": "/docs"}

@app.post("/whatsapp/error")
async def twilio_error_webhook(request: Request) -> dict[str, Any]:
    """
    Twilio Debugger / Error Webhook often posts as application/x-www-form-urlencoded.
    Be permissive: try JSON, then form, else log raw body.
    """
    ctype = request.headers.get("content-type", "")
    payload: dict[str, Any] = {}

    try:
        if "application/json" in ctype.lower():
            payload = await request.json()
        else:
            form = await request.form()
            payload = dict(form)
    except Exception as e:
        # Fall back to raw body so we never 500 here
        raw = (await request.body())[:2000]
        print("[TWILIO DEBUGGER RAW]", raw)
        print("[TWILIO DEBUGGER PARSE ERROR]", e)

    print("[TWILIO DEBUGGER PAYLOAD]", payload)
    return {"status": "received"}
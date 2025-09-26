import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.routes import jobs, whatsapp
from typing import Any

LOCAL_STORAGE_DIR = os.getenv("LOCAL_STORAGE_DIR", "./_local_uploads")
os.makedirs(LOCAL_STORAGE_DIR, exist_ok=True)

app = FastAPI(title="Photo Verify API", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mounts
app.mount("/uploads", StaticFiles(directory=LOCAL_STORAGE_DIR), name="uploads")
app.mount("/static", StaticFiles(directory="app/static"), name="static")
app.mount("/admin", StaticFiles(directory="admin", html=True), name="admin")

# Routers
app.include_router(jobs.router, prefix="/api", tags=["jobs"])
app.include_router(whatsapp.router, prefix="/api", tags=["whatsapp"])

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
# app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from app.routes import jobs, whatsapp

app = FastAPI(title="Photo Verify API", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve files saved to LOCAL_STORAGE_DIR at /static
LOCAL_DIR = os.getenv("LOCAL_STORAGE_DIR", "./_local_uploads")
os.makedirs(LOCAL_DIR, exist_ok=True)
app.mount("/static", StaticFiles(directory=LOCAL_DIR), name="static")

app.include_router(jobs.router, prefix="/api", tags=["jobs"])
app.include_router(whatsapp.router, prefix="/api", tags=["whatsapp"])

@app.get("/health")
def health():
    return {"status": "ok"}

# app/main.py
@app.get("/")
def root():
    return {"ok": True, "docs": "/docs"}

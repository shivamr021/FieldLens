# server/app/main.py

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles  # 1. IMPORT StaticFiles
from app.routes import jobs, whatsapp

# Get local storage path from environment (same as in storage_s3.py)
LOCAL_STORAGE_DIR = os.getenv("LOCAL_STORAGE_DIR", "./_local_uploads")

app = FastAPI(title="Photo Verify API", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 2. MOUNT the static directory to serve local images
# This tells FastAPI that any URL starting with "/static"
# should be served from your local uploads folder.
app.mount("/static", StaticFiles(directory=LOCAL_STORAGE_DIR), name="static")

app.include_router(jobs.router, prefix="/api", tags=["jobs"])

# NOTE: The /debug/upload endpoint is inside this router
app.include_router(whatsapp.router, prefix="/api", tags=["whatsapp"])


@app.get("/health")
def health():
    return {"status": "ok"}


# app/main.py
@app.get("/")
def root():
    return {"ok": True, "docs": "/docs"}

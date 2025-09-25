import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.routes import jobs, whatsapp

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

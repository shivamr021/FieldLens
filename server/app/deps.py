# app/deps.py
import os
from dotenv import load_dotenv

load_dotenv()

USE_FAKE = os.getenv("LOCAL_FAKE_DB", "0") == "1"
DB_NAME = os.getenv("DB_NAME", "photoverify")

db = None

if USE_FAKE:
    # In-memory Mongo stub (no external service)
    import mongomock
    client = mongomock.MongoClient()
    db = client[DB_NAME]
    print("[DB] Using mongomock (in-memory).")
else:
    # Real Mongo if you want later
    from pymongo import MongoClient
    MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
    client = MongoClient(MONGO_URI)
    db = client[DB_NAME]
    print(f"[DB] Connected to Mongo at {MONGO_URI}")

def get_db():
    return db

import os, io, uuid, time
from typing import Tuple

from dotenv import load_dotenv

load_dotenv()

USE_LOCAL = os.getenv("USE_LOCAL_STORAGE", "0") == "1"
BUCKET = os.getenv("S3_BUCKET", "")
REGION = os.getenv("AWS_REGION", "us-east-1")

LOCAL_DIR = os.getenv("LOCAL_STORAGE_DIR", "./_local_uploads")

if not USE_LOCAL:
    import boto3
    from botocore.client import Config

    s3 = boto3.client("s3", region_name=REGION, config=Config(signature_version="s3v4"))


def put_bytes(key: str, data: bytes) -> str:
    if USE_LOCAL:
        path = os.path.join(LOCAL_DIR, key)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as f:
            f.write(data)
        # Return a pseudo URL
        return f"file://{os.path.abspath(path)}"
    else:
        s3.put_object(Bucket=BUCKET, Key=key, Body=data, ContentType="image/jpeg")
        return f"s3://{BUCKET}/{key}"


def presign_url(key: str, expires: int = 3600) -> str:
    if USE_LOCAL:
        # served by app.main via StaticFiles (mounted at /uploads)
        return f"/uploads/{key}"
    else:
        return s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": BUCKET, "Key": key},
            ExpiresIn=expires,
        )



# def new_image_key(job_id: str, kind: str, ext: str = "jpg") -> str:
#     ts = int(time.time() * 1000)
#     uid = uuid.uuid4().hex[:8]
#     return f"jobs/{job_id}/raw/{ts}-{uid}-{kind}.{ext}"

def new_image_key(job_id: str, kind: str, ext: str = "jpg", sector: int | None = None) -> str:
    ts = int(time.time() * 1000)
    uid = uuid.uuid4().hex[:8]
    logical = f"sec{sector}_{kind.lower()}.{ext}" if sector else f"{kind.lower()}.{ext}"
    return f"jobs/{job_id}/raw/{ts}-{uid}-{logical}"


def get_bytes(key: str) -> bytes:
    """
    Return raw image bytes for a stored key.
    - Local: reads from LOCAL_DIR/key
    - S3:    downloads object
    """
    if USE_LOCAL:
        path = os.path.join(LOCAL_DIR, key)
        with open(path, "rb") as f:
            return f.read()
    else:
        obj = s3.get_object(Bucket=BUCKET, Key=key)
        return obj["Body"].read()

# app/routes/auth.py
import os, time
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, Response, Request
from jose import jwt, JWTError

router = APIRouter()

JWT_SECRET = os.getenv("ADMIN_JWT_SECRET", "change-me")
JWT_AUDIENCE = "fieldlens-admin"
JWT_ISSUER = "fieldlens-api"
SESSION_COOKIE = "fl_admin"
SESSION_TTL = 60 * 60 * 8  # 8 hours

ADMIN_USER = os.getenv("ADMIN_USERNAME", "admin")
ADMIN_PASS = os.getenv("ADMIN_PASSWORD", "admin123")  # change in env!

def _make_jwt(sub: str) -> str:
    now = int(time.time())
    payload = {"sub": sub, "iat": now, "exp": now + SESSION_TTL, "aud": JWT_AUDIENCE, "iss": JWT_ISSUER}
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")

def _verify(req: Request) -> Optional[str]:
    tok = req.cookies.get(SESSION_COOKIE)
    if not tok:
        return None
    try:
        data = jwt.decode(tok, JWT_SECRET, algorithms=["HS256"], audience=JWT_AUDIENCE, issuer=JWT_ISSUER)
        return str(data.get("sub"))
    except JWTError:
        return None
SECURE_COOKIE = os.getenv("COOKIE_SECURE", "true").lower() == "true"
@router.post("/auth/login")
def login(payload: dict, response: Response):
    if payload.get("username") != ADMIN_USER or payload.get("password") != ADMIN_PASS:
        raise HTTPException(401, "Invalid credentials")
    token = _make_jwt(ADMIN_USER)
    # HttpOnly cookie; on HF your domain is https, so Secure is fine
    response.set_cookie(
        key=SESSION_COOKIE, value=token, httponly=True, secure=SECURE_COOKIE, samesite="none", max_age=SESSION_TTL, path="/"
    )
    return {"ok": True}

@router.get("/auth/me")
def me(req: Request):
    sub = _verify(req)
    if not sub:
        raise HTTPException(401, "Not authenticated")
    return {"user": {"username": sub}}

@router.post("/auth/logout")
def logout(response: Response):
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"ok": True}

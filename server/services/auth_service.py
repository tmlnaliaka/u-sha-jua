import base64
import hashlib
import hmac
import json
import re
import secrets
import time
from typing import Any

from fastapi import HTTPException, status

from config import settings
from database import SessionLocal
from models.user import User

PASSWORD_ITERATIONS = 310_000
TOKEN_ALGORITHM = "HS256"


def _b64encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _b64decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def ensure_auth_configured() -> None:
    if len(settings.AUTH_SECRET_KEY.encode("utf-8")) < 32:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication is not configured. Set a random AUTH_SECRET_KEY of at least 32 characters.",
        )


def hash_password(password: str) -> str:
    if not 12 <= len(password) <= 128:
        raise ValueError("Password must be between 12 and 128 characters.")
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PASSWORD_ITERATIONS)
    return f"pbkdf2_sha256${PASSWORD_ITERATIONS}${_b64encode(salt)}${_b64encode(digest)}"


def verify_password(password: str, password_hash: str) -> bool:
    try:
        algorithm, iterations_text, salt_text, digest_text = password_hash.split("$")
        if algorithm != "pbkdf2_sha256":
            return False
        iterations = int(iterations_text)
        if not 100_000 <= iterations <= 1_000_000:
            return False
        expected = _b64decode(digest_text)
        actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), _b64decode(salt_text), iterations)
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


def create_access_token(user_id: str) -> str:
    ensure_auth_configured()
    now = int(time.time())
    expires = now + max(5, settings.AUTH_ACCESS_TOKEN_MINUTES) * 60
    header = _b64encode(json.dumps({"alg": TOKEN_ALGORITHM, "typ": "JWT"}, separators=(",", ":")).encode())
    payload = _b64encode(json.dumps({"sub": user_id, "iat": now, "exp": expires}, separators=(",", ":")).encode())
    unsigned = f"{header}.{payload}"
    signature = hmac.new(settings.AUTH_SECRET_KEY.encode(), unsigned.encode("ascii"), hashlib.sha256).digest()
    return f"{unsigned}.{_b64encode(signature)}"


def decode_access_token(token: str) -> dict[str, Any]:
    ensure_auth_configured()
    try:
        header_part, payload_part, signature_part = token.split(".")
        header = json.loads(_b64decode(header_part))
        if not isinstance(header, dict) or header.get("alg") != TOKEN_ALGORITHM or header.get("typ") != "JWT":
            raise ValueError("Unsupported token algorithm.")
        unsigned = f"{header_part}.{payload_part}"
        expected = hmac.new(settings.AUTH_SECRET_KEY.encode(), unsigned.encode("ascii"), hashlib.sha256).digest()
        if not hmac.compare_digest(expected, _b64decode(signature_part)):
            raise ValueError("Invalid token signature.")
        payload = json.loads(_b64decode(payload_part))
        if not isinstance(payload.get("sub"), str) or int(payload.get("exp", 0)) <= int(time.time()):
            raise ValueError("Expired or incomplete token.")
        return payload
    except (ValueError, TypeError, KeyError, json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired access token.") from exc


def valid_admin_bootstrap(email: str, password: str) -> tuple[str, str]:
    normalized = email.strip().lower()
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", normalized):
        raise ValueError("ADMIN_EMAIL must be a valid email address.")
    if not 12 <= len(password) <= 128:
        raise ValueError("ADMIN_PASSWORD must be between 12 and 128 characters long.")
    return normalized, password


def bootstrap_admin() -> None:
    if not settings.ADMIN_EMAIL and not settings.ADMIN_PASSWORD:
        return
    if not settings.ADMIN_EMAIL or not settings.ADMIN_PASSWORD:
        raise RuntimeError("Set both ADMIN_EMAIL and ADMIN_PASSWORD to provision the administrator account.")
    if len(settings.AUTH_SECRET_KEY.encode("utf-8")) < 32:
        raise RuntimeError("AUTH_SECRET_KEY must be at least 32 characters when authentication is enabled.")

    email, password = valid_admin_bootstrap(settings.ADMIN_EMAIL, settings.ADMIN_PASSWORD)
    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.email == email).first()
        if existing:
            if existing.role != "admin":
                raise RuntimeError("ADMIN_EMAIL belongs to a non-admin account; choose a dedicated admin email.")
            return
        db.add(User(
            email=email,
            display_name=settings.ADMIN_NAME.strip() or "Emergency Operations Administrator",
            password_hash=hash_password(password),
            role="admin",
        ))
        db.commit()
    finally:
        db.close()

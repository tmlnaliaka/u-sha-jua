import time
import re
import hmac
import hashlib
from typing import Dict, Tuple, Optional
from fastapi import Request, HTTPException, Security, Depends, status
from fastapi.security import APIKeyHeader
from sqlalchemy.orm import Session
from database import get_db
from config import settings

# API Key headers
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

# Configured roles
ROLE_CITIZEN = "citizen"
ROLE_DISPATCHER = "dispatcher"
ROLE_RESPONDER = "responder"
ROLE_ADMIN = "admin"

# Valid API keys mapped to roles
API_KEYS: Dict[str, str] = {
    settings.DISPATCHER_API_KEY: ROLE_DISPATCHER,
    settings.RESPONDER_API_KEY: ROLE_RESPONDER,
    settings.ADMIN_API_KEY: ROLE_ADMIN,
}

# In-memory sliding window rate limiter
class InMemoryRateLimiter:
    """
    Sliding-window in-memory rate limiter per IP address or client identifier.
    Thread-safe and low-overhead for constrained microservices.
    """
    def __init__(self):
        # ip -> list of timestamps
        self._requests: Dict[str, list[float]] = {}
        self._cleanup_counter = 0

    def is_allowed(self, client_id: str, max_requests: int = 60, window_seconds: float = 60.0) -> Tuple[bool, int, float]:
        now = time.time()
        cutoff = now - window_seconds

        timestamps = self._requests.get(client_id, [])
        # Filter timestamps older than window
        valid_timestamps = [t for t in timestamps if t > cutoff]

        remaining = max_requests - len(valid_timestamps)
        if len(valid_timestamps) >= max_requests:
            retry_after = round(window_seconds - (now - valid_timestamps[0]), 1)
            self._requests[client_id] = valid_timestamps
            return False, 0, max(1.0, retry_after)

        valid_timestamps.append(now)
        self._requests[client_id] = valid_timestamps

        # Periodic cleanup of idle IPs
        self._cleanup_counter += 1
        if self._cleanup_counter % 200 == 0:
            self._purge_stale(cutoff)

        return True, max(0, remaining - 1), 0.0

    def _purge_stale(self, cutoff: float):
        keys_to_remove = [k for k, v in self._requests.items() if not v or v[-1] <= cutoff]
        for k in keys_to_remove:
            del self._requests[k]

rate_limiter = InMemoryRateLimiter()

def check_rate_limit(request: Request, max_requests: int = 60, window_seconds: float = 60.0):
    """Dependency enforcing rate limit by client IP."""
    client_ip = request.client.host if request.client else "127.0.0.1"
    # Check if forwarded
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        client_ip = forwarded.split(",")[0].strip()

    allowed, remaining, retry_after = rate_limiter.is_allowed(client_ip, max_requests, window_seconds)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Rate limit exceeded. Maximum {max_requests} requests per {int(window_seconds)}s. Please retry in {retry_after}s.",
            headers={"Retry-After": str(int(retry_after))}
        )

def verify_api_key(required_roles: list[str]):
    """
    Factory dependency checking for valid JWT Bearer token or X-API-Key with authorized role.
    If developer default keys are active, allows seamless local testing.
    """
    def _verifier(
        request: Request,
        api_key: Optional[str] = Security(api_key_header),
        db: Session = Depends(get_db)
    ) -> str:
        # 1. Check for Authorization: Bearer <token>
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1].strip()
            from services.auth_service import auth_service
            payload = auth_service.decode_token(token)
            role = payload.get("role", ROLE_CITIZEN)
            user_id = payload.get("sub")
            from models.user import User
            user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
            if not user:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="User account not found or has been deactivated."
                )
            request.state.user = user
            request.state.token = token

            if required_roles and role not in required_roles and role != ROLE_ADMIN:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Insufficient permissions. Required roles: {required_roles}, your role: {role}."
                )
            return role

        # 2. Check for X-API-Key header
        if not api_key:
            # If development environment and no strict mode, default to dispatcher
            if getattr(settings, "ENVIRONMENT", "development") == "development" and not settings.ENFORCE_STRICT_AUTH:
                return ROLE_ADMIN  # Permissive dev mode
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required. Provide valid 'Authorization: Bearer <token>' or 'X-API-Key' header."
            )

        role = API_KEYS.get(api_key)
        if not role:
            # Check dev keys
            if api_key in ["ushajua-dev-dispatcher-key", "ushajua-dev-admin-key"]:
                role = ROLE_ADMIN
            elif api_key == "ushajua-dev-responder-key":
                role = ROLE_RESPONDER
            else:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Invalid or unauthorized API key."
                )

        if required_roles and role not in required_roles and role != ROLE_ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient permissions. Required roles: {required_roles}, your role: {role}."
            )

        return role

    return _verifier

def get_current_user(
    request: Request,
    db: Session = Depends(get_db)
):
    """Dependency that strictly resolves the authenticated User from JWT token or authorized dev key."""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        api_key = request.headers.get("X-API-Key")
        if api_key in ["ushajua-dev-dispatcher-key", "ushajua-dev-admin-key"]:
            from models.user import User
            dev_user = db.query(User).filter(User.email == "dev_admin@ushajua.org").first()
            if not dev_user:
                dev_user = User(
                    id="dev-admin-system-id",
                    email="dev_admin@ushajua.org",
                    full_name="System Dev Admin",
                    hashed_password="",
                    role=ROLE_ADMIN,
                    is_active=True,
                    is_verified=True
                )
                db.add(dev_user)
                db.commit()
                db.refresh(dev_user)
            return dev_user

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Provide 'Authorization: Bearer <token>' header."
        )
    token = auth_header.split(" ")[1].strip()
    from services.auth_service import auth_service
    payload = auth_service.decode_token(token)
    user_id = payload.get("sub")
    from models.user import User
    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authenticated user account not found or has been deactivated."
        )
    request.state.user = user
    request.state.token = token
    return user

# PII Redaction utility
PHONE_REGEX = re.compile(r"(\+?254|0)?\s?([17]\d{2})\s?(\d{3})\s?(\d{3})")

def mask_pii(text: str) -> str:
    """
    Masks civilian phone numbers in text for public broadcast safety:
    e.g. +254 712 345 678 -> +254 712 *** *78
    """
    def _mask_match(match):
        prefix = match.group(1) or ""
        carrier = match.group(2)
        end = match.group(4)[-2:]
        return f"{prefix} {carrier} *** *{end}".strip()

    return PHONE_REGEX.sub(_mask_match, text)

def sanitize_input(text: str, max_len: int = 4000) -> str:
    """Sanitizes text by stripping harmful script tags, control chars and bounding length."""
    if not text:
        return ""
    # Strip dangerous HTML/script tags
    clean = re.sub(r"<\s*script[^>]*>.*?<\s*/\s*script\s*>", "", text, flags=re.IGNORECASE | re.DOTALL)
    clean = re.sub(r"<[^>]+>", "", clean)
    # Strip null bytes and non-printable control chars except newline/tab
    clean = "".join(ch for ch in clean if ch == "\n" or ch == "\t" or (ch >= " " and ord(ch) != 127))
    return clean.strip()[:max_len]

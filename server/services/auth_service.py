import time
import uuid
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, Set
from jose import jwt, JWTError
from passlib.context import CryptContext
from fastapi import HTTPException, status
from config import settings
from services.cache_service import cache_service

# Password hashing configuration
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT configuration
SECRET_KEY = getattr(settings, "JWT_SECRET_KEY", "ushajua-production-sovereign-jwt-secret-key-2026")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 15
REFRESH_TOKEN_EXPIRE_DAYS = 7

# In-memory revocation mirror for backward-compatibility alongside shared cache_service (Redis / hybrid)
_revoked_tokens: Dict[str, float] = {}

class AuthService:
    """Enterprise authentication, cryptographic password hashing, and JWT lifecycle service."""

    @staticmethod
    def hash_password(password: str) -> str:
        return pwd_context.hash(password)

    @staticmethod
    def verify_password(plain_password: str, hashed_password: str) -> bool:
        return pwd_context.verify(plain_password, hashed_password)

    @staticmethod
    def create_access_token(user_id: str, role: str, email: str) -> str:
        now = int(time.time())
        expires = now + (ACCESS_TOKEN_EXPIRE_MINUTES * 60)
        jti = str(uuid.uuid4())
        payload: Dict[str, Any] = {
            "sub": user_id,
            "role": role,
            "email": email,
            "type": "access",
            "jti": jti,
            "iat": now,
            "exp": expires,
        }
        token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
        return token

    @staticmethod
    def create_refresh_token(user_id: str) -> str:
        now = int(time.time())
        expires = now + (REFRESH_TOKEN_EXPIRE_DAYS * 86400)
        jti = str(uuid.uuid4())
        payload: Dict[str, Any] = {
            "sub": user_id,
            "type": "refresh",
            "jti": jti,
            "iat": now,
            "exp": expires,
        }
        token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
        return token

    @staticmethod
    def decode_token(token: str) -> Dict[str, Any]:
        """Decodes and validates JWT signature and expiry. Checks revocation status."""
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            jti = payload.get("jti") or token
            if AuthService.is_token_revoked(jti):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Token has been revoked. Please authenticate again."
                )
            return payload
        except JWTError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired authentication token."
            )

    @staticmethod
    def revoke_token(token: str):
        """Revokes a JWT token in shared cache_service (Redis/Hybrid) so it is rejected across all workers."""
        now = time.time()
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM], options={"verify_exp": False})
            jti = payload.get("jti") or token
            exp = float(payload.get("exp", now + 3600))
            ttl = max(1.0, exp - now)
            _revoked_tokens[jti] = exp
            cache_service.set(f"revoked:{jti}", "1", ttl_seconds=ttl)
        except Exception:
            exp = now + 3600
            _revoked_tokens[token] = exp
            cache_service.set(f"revoked:{token}", "1", ttl_seconds=3600.0)

        # Purge expired entries
        AuthService.purge_expired_revocations()

    @staticmethod
    def purge_expired_revocations() -> int:
        """Purges expired JWT revocation records from local memory and hybrid cache."""
        now = time.time()
        expired_keys = [k for k, v in _revoked_tokens.items() if v < now]
        for k in expired_keys:
            del _revoked_tokens[k]
        cache_removed = cache_service.purge_expired_kv()
        return len(expired_keys) + cache_removed

    @staticmethod
    def is_token_revoked(jti_or_token: str) -> bool:
        if cache_service.exists(f"revoked:{jti_or_token}"):
            return True
        exp = _revoked_tokens.get(jti_or_token)
        if exp is not None:
            if exp >= time.time():
                return True
            del _revoked_tokens[jti_or_token]
        return False

auth_service = AuthService()

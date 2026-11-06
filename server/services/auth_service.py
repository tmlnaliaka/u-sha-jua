import time
import uuid
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, Set
from jose import jwt, JWTError
from passlib.context import CryptContext
from fastapi import HTTPException, status
from config import settings

# Password hashing configuration
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT configuration
SECRET_KEY = getattr(settings, "JWT_SECRET_KEY", "ushajua-production-sovereign-jwt-secret-key-2026")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 15
REFRESH_TOKEN_EXPIRE_DAYS = 7

# In-memory revocation cache for instant logouts (jti / token hash -> expiry timestamp)
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
        """Revokes a JWT token so it cannot be used again before natural expiry."""
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM], options={"verify_exp": False})
            jti = payload.get("jti") or token
            exp = payload.get("exp", time.time() + 3600)
            _revoked_tokens[jti] = float(exp)
        except Exception:
            _revoked_tokens[token] = time.time() + 3600

        # Purge expired entries
        now = time.time()
        expired_keys = [k for k, v in _revoked_tokens.items() if v < now]
        for k in expired_keys:
            del _revoked_tokens[k]

    @staticmethod
    def is_token_revoked(jti_or_token: str) -> bool:
        return jti_or_token in _revoked_tokens

auth_service = AuthService()

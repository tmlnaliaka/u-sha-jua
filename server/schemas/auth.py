import re
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator


def normalize_email(value: str) -> str:
    normalized = value.strip().lower()
    if len(normalized) > 320 or not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", normalized):
        raise ValueError("Enter a valid email address.")
    return normalized


class SurvivorRegistration(BaseModel):
    email: str
    password: str = Field(..., min_length=12, max_length=128)
    display_name: str = Field(..., min_length=2, max_length=120)
    phone_number: Optional[str] = Field(None, pattern=r"^\+[1-9]\d{7,14}$")

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        return normalize_email(value)

    @field_validator("display_name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        normalized = " ".join(value.split())
        if len(normalized) < 2:
            raise ValueError("Enter your name.")
        return normalized


class UserLogin(BaseModel):
    email: str
    password: str = Field(..., min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        return normalize_email(value)


class UserResponse(BaseModel):
    id: str
    email: str
    display_name: str
    role: Literal["admin", "survivor"]
    phone_number: Optional[str] = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    user: UserResponse

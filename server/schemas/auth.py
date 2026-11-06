from typing import Optional
from pydantic import BaseModel, EmailStr, Field

class UserSignup(BaseModel):
    email: EmailStr
    phone: Optional[str] = None
    password: str = Field(..., min_length=8, description="Password at least 8 characters")
    full_name: str = Field(..., min_length=2, max_length=255)
    role: Optional[str] = Field("citizen", description="citizen, responder, dispatcher, admin")

class UserLogin(BaseModel):
    identifier: Optional[str] = Field(None, description="Email or phone number")
    username_or_email: Optional[str] = Field(None, description="Alternative alias for identifier")
    password: str

    def get_identifier(self) -> str:
        return self.identifier or self.username_or_email or ""

class UserResponse(BaseModel):
    id: str
    email: str
    phone: Optional[str] = None
    full_name: str
    role: str
    is_active: bool
    is_verified: bool
    created_at: Optional[str] = None
    last_login_at: Optional[str] = None

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in_seconds: int = 900
    user: UserResponse

class TokenRefreshRequest(BaseModel):
    refresh_token: str

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(..., min_length=8)

class UserUpdateRequest(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None

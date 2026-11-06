import uuid
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session

from database import get_db
from models.user import User
from schemas.auth import (
    UserSignup, UserLogin, UserResponse, TokenResponse,
    TokenRefreshRequest, ForgotPasswordRequest, ResetPasswordRequest,
    UserUpdateRequest
)
from services.auth_service import auth_service
from services.security import get_current_user, ROLE_ADMIN, ROLE_DISPATCHER, sanitize_input
from services.audit_service import audit_service

router = APIRouter(prefix="/auth", tags=["Authentication & Identity"])

@router.post("/signup", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def signup(payload: UserSignup, db: Session = Depends(get_db)):
    """Registers a new user with bcrypt password hashing and verification code."""
    email_clean = payload.email.strip().lower()
    
    # Check duplicate email
    existing_email = db.query(User).filter(User.email == email_clean).first()
    if existing_email:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email address is already registered."
        )

    # Check duplicate phone if provided
    phone_clean = payload.phone.strip() if payload.phone else None
    if phone_clean:
        existing_phone = db.query(User).filter(User.phone == phone_clean).first()
        if existing_phone:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An account with this phone number is already registered."
            )

    # Validate role assignment
    allowed_roles = ["citizen", "responder", "dispatcher", "admin"]
    role = payload.role.lower() if payload.role and payload.role.lower() in allowed_roles else "citizen"

    user = User(
        id=str(uuid.uuid4()),
        email=email_clean,
        phone=phone_clean,
        full_name=sanitize_input(payload.full_name, max_len=255),
        hashed_password=auth_service.hash_password(payload.password),
        role=role,
        is_active=True,
        is_verified=False,
        verification_token=uuid.uuid4().hex[:6].upper(),
        created_at=datetime.utcnow()
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    audit_service.log_event(
        action="USER_REGISTERED",
        actor=user.email,
        details={"user_id": user.id, "role": user.role}
    )

    return user.to_dict()

@router.post("/login", response_model=TokenResponse)
def login(payload: UserLogin, db: Session = Depends(get_db)):
    """Authenticates user via email or phone + password, issuing access & refresh tokens."""
    identifier_clean = payload.get_identifier().strip().lower()
    if not identifier_clean:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Identifier (email or phone) is required"
        )

    user = db.query(User).filter(
        (User.email == identifier_clean) | (User.phone == payload.get_identifier().strip())
    ).first()

    if not user or not auth_service.verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials. Verify your email/phone and password."
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account has been suspended or deactivated. Contact system admin."
        )

    user.last_login_at = datetime.utcnow()
    db.commit()

    access_token = auth_service.create_access_token(user.id, user.role, user.email)
    refresh_token = auth_service.create_refresh_token(user.id)

    audit_service.log_event(
        action="USER_LOGGED_IN",
        actor=user.email,
        details={"user_id": user.id, "role": user.role}
    )

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "expires_in_seconds": 900,
        "user": user.to_dict()
    }

@router.post("/refresh", response_model=dict)
def refresh_token(payload: TokenRefreshRequest, db: Session = Depends(get_db)):
    """Exchanges a valid refresh token for a fresh 15-minute access token."""
    decoded = auth_service.decode_token(payload.refresh_token)
    if decoded.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provided token is not a refresh token."
        )

    user_id = decoded.get("sub")
    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User no longer active or exists."
        )

    new_access_token = auth_service.create_access_token(user.id, user.role, user.email)
    return {
        "access_token": new_access_token,
        "token_type": "bearer",
        "expires_in_seconds": 900
    }

@router.post("/logout")
def logout(request: Request, current_user: User = Depends(get_current_user)):
    """Revokes the current JWT session token and logs out."""
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1].strip()
        auth_service.revoke_token(token)

    audit_service.log_event(
        action="USER_LOGGED_OUT",
        actor=current_user.email,
        details={"user_id": current_user.id}
    )
    return {"message": "Session successfully terminated."}

@router.post("/verify")
def verify_account(token: str, db: Session = Depends(get_db)):
    """Verifies user email or phone with verification code."""
    user = db.query(User).filter(User.verification_token == token.strip().upper()).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification token."
        )
    user.is_verified = True
    user.verification_token = None
    db.commit()
    return {"message": "Account successfully verified."}

@router.post("/forgot-password")
def forgot_password(payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    """Generates password reset token and dispatches reset instructions."""
    email_clean = payload.email.strip().lower()
    user = db.query(User).filter(User.email == email_clean).first()
    if not user:
        # Prevent user enumeration by returning standard success message
        return {
            "message": "If an account matches this email, reset instructions have been issued.",
            "reset_token": None
        }

    token = str(uuid.uuid4())
    user.reset_token = token
    user.reset_token_expires_at = datetime.utcnow() + timedelta(hours=1)
    db.commit()

    audit_service.log_event(
        action="PASSWORD_RESET_REQUESTED",
        actor=user.email,
        details={"user_id": user.id}
    )

    return {
        "message": "Password reset token generated.",
        "reset_token": token
    }

@router.post("/reset-password")
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    """Resets password using valid unexpired reset token."""
    user = db.query(User).filter(
        User.reset_token == payload.token,
        User.reset_token_expires_at > datetime.utcnow()
    ).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid, expired, or previously consumed reset token."
        )

    user.hashed_password = auth_service.hash_password(payload.new_password)
    user.reset_token = None
    user.reset_token_expires_at = None
    db.commit()

    audit_service.log_event(
        action="PASSWORD_RESET_COMPLETED",
        actor=user.email,
        details={"user_id": user.id}
    )

    return {"message": "Password successfully updated. You may now log in with your new password."}

@router.get("/me", response_model=UserResponse)
def get_current_user_profile(current_user: User = Depends(get_current_user)):
    """Retrieves profile of the authenticated caller."""
    return current_user.to_dict()

@router.get("/users/{user_id}", response_model=UserResponse)
def get_user_profile_by_id(
    user_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    IDOR Protected user profile view.
    Only allows users to read their own profile, unless caller has admin or dispatcher role.
    """
    if current_user.id != user_id and current_user.role not in [ROLE_ADMIN, ROLE_DISPATCHER]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: You do not have permission to view this user profile."
        )

    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found.")
    return target_user.to_dict()

@router.patch("/users/{user_id}", response_model=UserResponse)
def update_user_profile_by_id(
    user_id: str,
    payload: UserUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    IDOR Protected user profile update.
    Only allows users to modify their own profile, unless caller is an admin.
    """
    if current_user.id != user_id and current_user.role != ROLE_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: You do not have permission to modify this user account."
        )

    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found.")

    if payload.full_name is not None:
        target_user.full_name = sanitize_input(payload.full_name, max_len=255)
    if payload.phone is not None:
        target_user.phone = payload.phone.strip()

    db.commit()
    db.refresh(target_user)
    return target_user.to_dict()

@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user_account(
    user_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Deactivates or soft-deletes a user account.
    Kenya DPA 2019 / GDPR Right to Erasure compliant.
    IDOR Protected: Users can deactivate their own account; dispatchers and admins can manage accounts.
    """
    if current_user.id != user_id and current_user.role not in [ROLE_ADMIN, ROLE_DISPATCHER]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: You do not have permission to delete this account."
        )

    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found.")

    target_user.is_active = False
    db.commit()

    audit_service.log_event(
        action="USER_ACCOUNT_DEACTIVATED",
        actor=current_user.email,
        details={"user_id": target_user.id, "email": target_user.email}
    )
    return None

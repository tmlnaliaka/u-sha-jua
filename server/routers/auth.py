from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from database import get_db
from models.user import User
from schemas.auth import SurvivorRegistration, TokenResponse, UserLogin, UserResponse
from services.auth_dependencies import get_current_user
from services.auth_service import create_access_token, ensure_auth_configured, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["Authentication"])


def _user_response(user: User) -> UserResponse:
    return UserResponse(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        role=user.role,
        phone_number=user.phone_number,
    )


def _token_response(user: User) -> TokenResponse:
    return TokenResponse(access_token=create_access_token(user.id), user=_user_response(user))


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register_survivor(registration: SurvivorRegistration, db: Session = Depends(get_db)):
    ensure_auth_configured()
    if db.query(User).filter(User.email == registration.email).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="An account with this email already exists.")

    user = User(
        email=registration.email,
        display_name=registration.display_name,
        password_hash=hash_password(registration.password),
        phone_number=registration.phone_number,
        role="survivor",
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        ) from exc
    db.refresh(user)
    return _token_response(user)


@router.post("/login", response_model=TokenResponse)
def login(credentials: UserLogin, db: Session = Depends(get_db)):
    ensure_auth_configured()
    user = db.query(User).filter(User.email == credentials.email).first()
    if user is None or not user.is_active or not verify_password(credentials.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Email or password is incorrect.")
    return _token_response(user)


@router.get("/me", response_model=UserResponse)
def current_account(user: User = Depends(get_current_user)):
    return _user_response(user)

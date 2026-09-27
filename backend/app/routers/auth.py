from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.auth import (
    ForgotPasswordRequest, SignupVerifyRequest,
    TokenResponse, UserResponse, VerifyOtpRequest,
)
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/otp/request")
def request_login_otp(payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    return AuthService(db).request_login_otp(payload.email, payload.language)


@router.post("/otp/login", response_model=TokenResponse)
def login_with_otp(payload: VerifyOtpRequest, db: Session = Depends(get_db)):
    result = AuthService(db).verify_login_otp(payload.email, payload.otp)
    return {"access_token": result["access_token"], "token_type": "bearer", "user": result.get("user")}


@router.post("/otp/request-signup")
def request_signup_otp(payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    return AuthService(db).request_signup_otp(payload.email, payload.language)


@router.post("/otp/verify-signup", response_model=TokenResponse)
def signup_with_otp(payload: SignupVerifyRequest, db: Session = Depends(get_db)):
    result = AuthService(db).verify_signup_otp(payload.email, payload.otp, payload.phone_number)
    return {"access_token": result["access_token"], "token_type": "bearer", "user": result.get("user")}
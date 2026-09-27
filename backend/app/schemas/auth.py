from datetime import datetime

from pydantic import BaseModel, EmailStr


class UserResponse(BaseModel):
    id: int
    email: EmailStr
    phone_number: str | None = None
    role: str | None = "user"
    created_at: datetime | None = None

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse | None = None


class ForgotPasswordRequest(BaseModel):
    email: EmailStr
    language: str | None = "en"
    role: str | None = "user"


class VerifyOtpRequest(BaseModel):
    email: EmailStr
    otp: str


class SignupVerifyRequest(BaseModel):
    email: EmailStr
    otp: str
    phone_number: str = ""
    role: str | None = "user"
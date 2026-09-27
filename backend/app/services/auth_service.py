import hashlib
import secrets
from datetime import datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.models.otp import OtpCode
from app.models.user import User
from app.services.email_service import send_email
from app.utils.security import create_access_token, hash_password

OTP_EXPIRE_MINUTES = 10
OTP_MAX_ATTEMPTS = 5


def _hash_otp(code: str) -> str:
    return hashlib.sha256(f"{code}:{settings.SECRET_KEY}".encode("utf-8")).hexdigest()


def _to_user_dict(user: User) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "phone_number": user.phone_number or "",
        "role": user.role or "user",
    }


class AuthService:
    def __init__(self, db: Session):
        self.db = db

    def me(self, user: User) -> dict:
        return _to_user_dict(user)

    @staticmethod
    def _normalize_phone(phone: str) -> str:
        digits = "".join(ch for ch in str(phone or "") if ch.isdigit())
        return digits[-10:] if digits else ""

    @staticmethod
    def _otp_texts(purpose: str, otp: str, lang: str) -> tuple[str, str]:
        """Subject + body for an OTP email. Only Hindi has a full template."""
        if lang == "hi":
            if purpose == "signup":
                return (
                    "आपका VittVanni साइनअप कोड",
                    f"नमस्ते,\n\nVittVanni खाता बनाने के लिए इस वन-टाइम कोड का उपयोग करें:\n\n"
                    f"    {otp}\n\nयह कोड {OTP_EXPIRE_MINUTES} मिनट में समाप्त हो जाएगा।\n"
                    f"यदि आपने यह अनुरोध नहीं किया था, तो इस ईमेल को अनदेखा करें।\n\n- VittVanni टीम",
                )
            return (
                "आपका VittVanni लॉगिन कोड",
                f"नमस्ते,\n\nVittVanni में लॉग इन करने के लिए इस वन-टाइम कोड का उपयोग करें:\n\n"
                f"    {otp}\n\nयह कोड {OTP_EXPIRE_MINUTES} मिनट में समाप्त हो जाएगा।\n"
                f"यदि आपने यह अनुरोध नहीं किया था, तो इस ईमेल को अनदेखा करें।\n\n- VittVanni टीम",
            )
        if purpose == "signup":
            return (
                "Your VittVanni signup code",
                f"Hello,\n\nUse this one-time code to create your VittVanni account:\n\n"
                f"    {otp}\n\nThis code expires in {OTP_EXPIRE_MINUTES} minutes.\n"
                f"If you didn't request this, you can safely ignore this email.\n\n- VittVanni Team",
            )
        return (
            "Your VittVanni login code",
            f"Hello,\n\nUse this one-time code to log in to VittVanni:\n\n"
            f"    {otp}\n\nThis code expires in {OTP_EXPIRE_MINUTES} minutes.\n"
            f"If you didn't request this, you can safely ignore this email.\n\n- VittVanni Team",
        )

    def _deliver_otp(self, email: str, otp: str, purpose: str, language: str) -> None:
        lang = "hi" if (language or "").lower().startswith("hi") else "en"
        subject, body = self._otp_texts(purpose, otp, lang)
        delivered = send_email(email, subject, body)
        print(f"[OTP:{purpose}:{lang}] For {email}: code {otp} -> email delivery {'OK' if delivered else 'SKIPPED (SMTP not configured)'}")

    def _issue_otp_for_email(self, email: str, purpose: str, language: str = "en", user: User | None = None) -> str:
        normalized = email.lower()
        # Prefer the caller's language, else the account's saved preference.
        lang = language or "en"
        if user is not None and (not lang or lang == "en"):
            pref = getattr(getattr(user, "profile", None), "language_preference", None)
            if pref:
                lang = pref
        self.db.query(OtpCode).filter(
            OtpCode.email == normalized, OtpCode.purpose == purpose
        ).delete()
        self.db.commit()

        otp = f"{secrets.randbelow(1000000):06d}"
        self.db.add(OtpCode(
            email=normalized,
            code_hash=_hash_otp(otp),
            purpose=purpose,
            created_at=datetime.utcnow(),
            expires_at=datetime.utcnow() + timedelta(minutes=OTP_EXPIRE_MINUTES),
        ))
        self.db.commit()
        self._deliver_otp(normalized, otp, purpose, lang)
        return otp

    def _issue_otp(self, user: User, purpose: str, language: str = "en") -> str:
        return self._issue_otp_for_email(user.email, purpose, language, user)

    def _check_otp(self, email: str, otp: str, purpose: str, require_user: bool = True) -> tuple[User | None, OtpCode]:
        normalized_email = email.lower()
        user = self.db.query(User).filter(User.email == normalized_email).first()
        if not user and require_user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        code = (
            self.db.query(OtpCode)
            .filter(
                OtpCode.email == normalized_email,
                OtpCode.purpose == purpose,
                OtpCode.used.is_(False),
            )
            .order_by(OtpCode.id.desc())
            .first()
        )
        if code is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No OTP requested for this account")
        if code.expires_at < datetime.utcnow():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="OTP has expired. Please request a new one")
        if code.attempts >= OTP_MAX_ATTEMPTS:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Too many incorrect attempts. Please request a new OTP")

        if not secrets.compare_digest(code.code_hash, _hash_otp(otp.strip())):
            code.attempts += 1
            self.db.commit()
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid OTP. Please try again")
        return user, code

    def request_login_otp(self, email: str, language: str | None = "en") -> dict:
        """Passwordless login step 1: email a single-use login code."""
        user = self.db.query(User).filter(User.email == email.lower()).first()
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        self._issue_otp(user, "login", language or "en")
        return {
            "message": f"A login code has been sent to your email (valid for {OTP_EXPIRE_MINUTES} minutes)",
            "expires_in_minutes": OTP_EXPIRE_MINUTES,
        }

    def verify_login_otp(self, email: str, otp: str) -> dict:
        """Passwordless login step 2: exchange the code for an access token."""
        user, code = self._check_otp(email, otp, "login")
        assert user is not None
        code.used = True
        user.last_login = datetime.utcnow()
        self.db.commit()
        token = create_access_token(user.id, role=user.role or "user")
        return {"access_token": token, "token_type": "bearer", "user": _to_user_dict(user)}

    @staticmethod
    def _normalize_role(role: str | None) -> str:
        return "partner" if (role or "").lower() == "partner" else "user"

    def request_signup_otp(self, email: str, language: str | None = "en", role: str | None = "user") -> dict:
        """Passwordless signup step 1: email a single-use code for a new account."""
        normalized = email.lower()
        if self.db.query(User).filter(User.email == normalized).first():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Account already exists. Please log in with an OTP instead.",
            )
        self._issue_otp_for_email(normalized, "signup", language or "en")
        return {
            "message": f"A signup code has been sent to your email (valid for {OTP_EXPIRE_MINUTES} minutes)",
            "expires_in_minutes": OTP_EXPIRE_MINUTES,
        }

    def verify_signup_otp(self, email: str, otp: str, phone_number: str = "", role: str | None = "user") -> dict:
        """Passwordless signup step 2: verify the code and create the account."""
        from app.models.partner_profile import PartnerProfile

        normalized = email.lower()
        if self.db.query(User).filter(User.email == normalized).first():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Account already exists. Please log in with an OTP instead.",
            )
        _, code = self._check_otp(normalized, otp, "signup", require_user=False)
        code.used = True
        user_role = self._normalize_role(role)
        user = User(
            email=normalized,
            # No user-known password exists; store an unusable random secret
            # so the column stays populated and password auth stays dead.
            password_hash=hash_password(secrets.token_hex(32)),
            phone_number=self._normalize_phone(phone_number),
            role=user_role,
        )
        user.last_login = datetime.utcnow()
        self.db.add(user)
        self.db.flush()
        if user_role == "partner":
            self.db.add(PartnerProfile(user_id=user.id, org_name=""))
        self.db.commit()
        self.db.refresh(user)
        token = create_access_token(user.id, role=user_role)
        return {"access_token": token, "token_type": "bearer", "user": _to_user_dict(user)}
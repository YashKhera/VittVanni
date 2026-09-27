import re
import secrets
from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.application import (
    STATUS_APPROVED,
    STATUS_REJECTED,
    STATUS_REVIEW,
    STATUS_SUBMITTED,
    VALID_STATUSES,
    Application,
    ApplicationMessage,
)
from app.models.partner_profile import PartnerProfile
from app.models.partner_scheme import PartnerScheme
from app.models.profile import EntrepreneurProfile
from app.models.scheme import Scheme
from app.models.user import User
from app.utils.helpers import normalize_list

SENSITIVE_HINTS = ("pan", "aadhaar", "aadhar", "apaar", "passport", "voter", "driving", "license", "dl no")


def slugify(label: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", (label or "").lower()).strip("_")
    return slug or "document"


def is_sensitive(label: str) -> bool:
    low = (label or "").lower()
    return any(h in low for h in SENSITIVE_HINTS)


def mask_value(value: str) -> str:
    v = str(value or "")
    if len(v) <= 4:
        return "••••"
    return "••••" + v[-4:]


def mask_documents(documents: dict) -> dict:
    return {k: (mask_value(v) if is_sensitive(k) else v) for k, v in (documents or {}).items()}


def doc_fields_for_scheme(scheme: Scheme) -> list[dict]:
    fields = []
    for label in normalize_list(scheme.documents):
        label = str(label).strip()
        if not label:
            continue
        fields.append({
            "key": slugify(label),
            "label": label,
            "sensitive": is_sensitive(label),
            "required": True,
        })
    return fields


def generate_application_no(db: Session) -> str:
    year = datetime.utcnow().year
    for _ in range(10):
        no = f"VV-{year}-{secrets.randbelow(900000) + 100000}"
        if not db.query(Application).filter(Application.application_no == no).first():
            return no
    return f"VV-{year}-{secrets.token_hex(3).upper()}"


def serialize_application(app: Application, viewer: User) -> dict:
    role = viewer.role or "user"
    is_owner = app.user_id == viewer.id
    is_partner = role == "partner" and app.partner and app.partner.user_id == viewer.id
    if not (is_owner or is_partner):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")
    docs = dict(app.documents or {})
    if is_partner:
        docs = mask_documents(docs)
    data = {
        "id": app.id,
        "application_no": app.application_no,
        "scheme_id": app.scheme_id,
        "scheme_name": app.scheme.name if app.scheme else "",
        "partner_id": app.partner_id,
        "partner_name": app.partner.org_name if app.partner else "",
        "status": app.status,
        "form_data": dict(app.form_data or {}),
        "documents": docs,
        "created_at": app.created_at,
        "updated_at": app.updated_at,
    }
    # Contact details are visible to the partner only during review.
    if is_owner:
        data["applicant_email"] = app.user.email if app.user else None
        data["applicant_phone"] = app.user.phone_number if app.user else None
    elif is_partner and app.status == STATUS_REVIEW:
        data["applicant_email"] = app.user.email if app.user else None
        data["applicant_phone"] = app.user.phone_number if app.user else None
    return data


class ApplicationService:
    def __init__(self, db: Session):
        self.db = db

    def _get_scheme(self, scheme_id: int) -> Scheme:
        scheme = self.db.query(Scheme).filter(Scheme.id == scheme_id).first()
        if not scheme:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scheme not found")
        return scheme

    def _partner_serves(self, partner_id: int, scheme_id: int) -> PartnerProfile:
        partner = self.db.query(PartnerProfile).filter(PartnerProfile.id == partner_id).first()
        if not partner:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Partner not found")
        link = (
            self.db.query(PartnerScheme)
            .filter(PartnerScheme.partner_id == partner_id, PartnerScheme.scheme_id == scheme_id)
            .first()
        )
        if not link:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This partner does not serve the selected scheme",
            )
        return partner

    def available_partners(self, scheme_id: int, state: str | None = None) -> list[dict]:
        from sqlalchemy import or_

        self._get_scheme(scheme_id)
        q = (
            self.db.query(PartnerProfile)
            .join(PartnerScheme, PartnerScheme.partner_id == PartnerProfile.id)
            .filter(PartnerScheme.scheme_id == scheme_id)
        )
        if state:
            # Partners without a saved state serve everywhere; same-state first.
            q = q.filter(or_(
                PartnerProfile.state == state.lower(),
                PartnerProfile.state.is_(None),
                PartnerProfile.state == "",
            )).order_by(
                PartnerProfile.state.is_(None),
                PartnerProfile.state == "",
            )
        out = []
        for p in q.all():
            handled = (
                self.db.query(Application)
                .filter(
                    Application.partner_id == p.id,
                    Application.scheme_id == scheme_id,
                    Application.status != STATUS_REJECTED,
                )
                .count()
            )
            out.append({
                "partner_id": p.id,
                "org_name": p.org_name or "",
                "partner_type": p.partner_type or "",
                "city": p.city or "",
                "state": p.state or "",
                "phone": p.phone or "",
                "applications_handled": handled,
            })
        return out

    def create_application(self, user: User, scheme_id: int, partner_id: int,
                           form_data: dict, documents: dict) -> dict:
        scheme = self._get_scheme(scheme_id)
        self._partner_serves(partner_id, scheme_id)
        expected = {f["key"] for f in doc_fields_for_scheme(scheme)}
        provided = {str(k): str(v or "").strip() for k, v in (documents or {}).items()}
        missing = [k for k in expected if not provided.get(k)]
        if missing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Missing required documents: {', '.join(missing)}",
            )
        app = Application(
            application_no=generate_application_no(self.db),
            user_id=user.id,
            scheme_id=scheme_id,
            partner_id=partner_id,
            status=STATUS_SUBMITTED,
            form_data={str(k): str(v or "") for k, v in (form_data or {}).items()},
            documents=provided,
        )
        self.db.add(app)
        self.db.commit()
        self.db.refresh(app)
        return serialize_application(app, user)

    def my_applications(self, user: User) -> list[dict]:
        apps = (
            self.db.query(Application)
            .filter(Application.user_id == user.id)
            .order_by(Application.id.desc())
            .all()
        )
        return [serialize_application(a, user) for a in apps]

    def get_application(self, user: User, application_id: int) -> dict:
        app = self.db.query(Application).filter(Application.id == application_id).first()
        if not app:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")
        return serialize_application(app, user)

    # ---- partner side ----

    def _partner_profile(self, user: User) -> PartnerProfile:
        profile = (
            self.db.query(PartnerProfile).filter(PartnerProfile.user_id == user.id).first()
        )
        if not profile:
            profile = PartnerProfile(user_id=user.id, org_name="")
            self.db.add(profile)
            self.db.commit()
            self.db.refresh(profile)
        return profile

    def partner_schemes(self, user: User) -> list[dict]:
        profile = self._partner_profile(user)
        out = []
        for link in (
            self.db.query(PartnerScheme).filter(PartnerScheme.partner_id == profile.id).all()
        ):
            scheme = self.db.query(Scheme).filter(Scheme.id == link.scheme_id).first()
            counts = {s: 0 for s in VALID_STATUSES}
            rows = (
                self.db.query(Application)
                .filter(Application.partner_id == profile.id, Application.scheme_id == link.scheme_id)
                .all()
            )
            for r in rows:
                counts[r.status] = counts.get(r.status, 0) + 1
            out.append({
                "scheme_id": link.scheme_id,
                "scheme_name": scheme.name if scheme else "",
                "total": len(rows),
                "submitted": counts.get(STATUS_SUBMITTED, 0),
                "under_review": counts.get(STATUS_REVIEW, 0),
                "approved": counts.get(STATUS_APPROVED, 0),
                "rejected": counts.get(STATUS_REJECTED, 0),
            })
        return out

    def set_partner_schemes(self, user: User, scheme_ids: list[int]) -> list[dict]:
        profile = self._partner_profile(user)
        valid = {
            s.id
            for s in self.db.query(Scheme).filter(Scheme.id.in_(scheme_ids or [])).all()
        } if scheme_ids else set()
        self.db.query(PartnerScheme).filter(PartnerScheme.partner_id == profile.id).delete()
        for sid in sorted(valid):
            self.db.add(PartnerScheme(partner_id=profile.id, scheme_id=sid))
        self.db.commit()
        return self.partner_schemes(user)

    def inbox(self, user: User, scheme_id: int | None = None) -> list[dict]:
        profile = self._partner_profile(user)
        q = self.db.query(Application).filter(Application.partner_id == profile.id)
        if scheme_id:
            q = q.filter(Application.scheme_id == scheme_id)
        return [serialize_application(a, user) for a in q.order_by(Application.id.desc()).all()]

    def applicant_detail(self, user: User, application_id: int) -> dict:
        profile = self._partner_profile(user)
        app = (
            self.db.query(Application)
            .filter(Application.id == application_id, Application.partner_id == profile.id)
            .first()
        )
        if not app:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")
        data = serialize_application(app, user)
        prof = (
            self.db.query(EntrepreneurProfile)
            .filter(EntrepreneurProfile.user_id == app.user_id)
            .first()
        )
        return {
            "application": data,
            "full_name": (prof.full_name if prof else "") or "",
            "business_name": (prof.business_name if prof else "") or "",
            "business_sector": (prof.business_sector if prof else "") or "",
            "business_stage": (prof.business_stage if prof else "") or "",
            "state": (prof.state if prof else "") or "",
            "description": prof.description if prof else None,
            "contact_email": data.get("applicant_email"),
            "contact_phone": data.get("applicant_phone"),
        }

    def set_status(self, user: User, application_id: int, new_status: str) -> dict:
        profile = self._partner_profile(user)
        app = (
            self.db.query(Application)
            .filter(Application.id == application_id, Application.partner_id == profile.id)
            .first()
        )
        if not app:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")
        new_status = (new_status or "").lower()
        if new_status not in VALID_STATUSES:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid status")
        allowed = {
            STATUS_SUBMITTED: {STATUS_REVIEW, STATUS_APPROVED, STATUS_REJECTED},
            STATUS_REVIEW: {STATUS_APPROVED, STATUS_REJECTED},
            STATUS_APPROVED: set(),
            STATUS_REJECTED: set(),
        }
        if new_status not in allowed.get(app.status, set()):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot move application from {app.status} to {new_status}",
            )
        app.status = new_status
        app.updated_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(app)
        return serialize_application(app, user)

    # ---- review-phase chat ----

    def _chat_application(self, user: User, application_id: int) -> Application:
        app = self.db.query(Application).filter(Application.id == application_id).first()
        if not app:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")
        role = user.role or "user"
        is_owner = app.user_id == user.id
        is_partner = role == "partner" and app.partner and app.partner.user_id == user.id
        if not (is_owner or is_partner):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")
        if app.status != STATUS_REVIEW:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Chat is available only while the application is under review",
            )
        return app

    def send_message(self, user: User, application_id: int, body: str) -> dict:
        app = self._chat_application(user, application_id)
        text = (body or "").strip()[:2000]
        if not text:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Message is empty")
        msg = ApplicationMessage(
            application_id=app.id,
            sender_user_id=user.id,
            sender_role=user.role or "user",
            body=text,
        )
        self.db.add(msg)
        self.db.commit()
        self.db.refresh(msg)
        return self._serialize_message(msg, user.id)

    def list_messages(self, user: User, application_id: int, after_id: int = 0) -> list[dict]:
        app = self._chat_application(user, application_id)
        q = (
            self.db.query(ApplicationMessage)
            .filter(
                ApplicationMessage.application_id == app.id,
                ApplicationMessage.id > (after_id or 0),
            )
            .order_by(ApplicationMessage.id.asc())
        )
        return [self._serialize_message(m, user.id) for m in q.all()]

    @staticmethod
    def _serialize_message(msg: ApplicationMessage, viewer_id: int) -> dict:
        return {
            "id": msg.id,
            "sender_role": msg.sender_role,
            "body": msg.body,
            "mine": msg.sender_user_id == viewer_id,
            "created_at": msg.created_at,
        }

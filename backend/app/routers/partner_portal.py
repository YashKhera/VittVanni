from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.auth import require_partner
from app.models.user import User
from app.schemas.application import (
    ApplicantDetail,
    ApplicationOut,
    PartnerProfileUpdate,
    PartnerSchemeInfo,
    PartnerSchemesUpdate,
    StatusUpdate,
)
from app.services.application_service import ApplicationService

router = APIRouter(prefix="/partner", tags=["partner"])


@router.get("/schemes", response_model=list[PartnerSchemeInfo])
def my_schemes(
    current_user: User = Depends(require_partner),
    db: Session = Depends(get_db),
):
    return ApplicationService(db).partner_schemes(current_user)


@router.put("/schemes", response_model=list[PartnerSchemeInfo])
def set_schemes(
    payload: PartnerSchemesUpdate,
    current_user: User = Depends(require_partner),
    db: Session = Depends(get_db),
):
    return ApplicationService(db).set_partner_schemes(current_user, payload.scheme_ids)


@router.get("/applications", response_model=list[ApplicationOut])
def inbox(
    scheme_id: int | None = Query(None),
    current_user: User = Depends(require_partner),
    db: Session = Depends(get_db),
):
    return ApplicationService(db).inbox(current_user, scheme_id)


@router.get("/applications/{application_id}", response_model=ApplicantDetail)
def applicant_detail(
    application_id: int,
    current_user: User = Depends(require_partner),
    db: Session = Depends(get_db),
):
    return ApplicationService(db).applicant_detail(current_user, application_id)


@router.post("/applications/{application_id}/status", response_model=ApplicationOut)
def set_status(
    application_id: int,
    payload: StatusUpdate,
    current_user: User = Depends(require_partner),
    db: Session = Depends(get_db),
):
    return ApplicationService(db).set_status(current_user, application_id, payload.status)


@router.get("/profile")
def get_profile(
    current_user: User = Depends(require_partner),
    db: Session = Depends(get_db),
):
    profile = ApplicationService(db)._partner_profile(current_user)
    return {
        "org_name": profile.org_name or "",
        "partner_type": profile.partner_type or "other",
        "phone": profile.phone or "",
        "state": profile.state or "",
        "city": profile.city or "",
        "address": profile.address or "",
    }


@router.put("/profile")
def update_profile(
    payload: PartnerProfileUpdate,
    current_user: User = Depends(require_partner),
    db: Session = Depends(get_db),
):
    from fastapi import HTTPException, status as http_status

    svc = ApplicationService(db)
    profile = svc._partner_profile(current_user)
    if payload.partner_type is not None and payload.partner_type not in (
        "sca", "psb", "rrb", "nbfc_mfi", "other",
    ):
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="Invalid partner type",
        )
    for field in ("org_name", "partner_type", "phone", "state", "city", "address"):
        value = getattr(payload, field)
        if value is not None:
            setattr(profile, field, value.lower() if field == "state" and value else value)
    db.commit()
    db.refresh(profile)
    return {"message": "Partner profile updated"}

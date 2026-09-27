from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.application import (
    ApplicationCreate,
    ApplicationOut,
    ChatMessage,
    DocSchemaResponse,
    MessageCreate,
    PartnerPublic,
)
from app.services.application_service import ApplicationService, doc_fields_for_scheme

router = APIRouter(prefix="/applications", tags=["applications"])


@router.get("/doc-schema/{scheme_id}", response_model=DocSchemaResponse)
def doc_schema(
    scheme_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from app.models.scheme import Scheme

    scheme = db.query(Scheme).filter(Scheme.id == scheme_id).first()
    if not scheme:
        from fastapi import HTTPException, status

        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scheme not found")
    return {"scheme_id": scheme_id, "fields": doc_fields_for_scheme(scheme)}


@router.get("/partners", response_model=list[PartnerPublic])
def available_partners(
    scheme_id: int = Query(...),
    state: str | None = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return ApplicationService(db).available_partners(scheme_id, state)


@router.post("", response_model=ApplicationOut)
def create_application(
    payload: ApplicationCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return ApplicationService(db).create_application(
        current_user, payload.scheme_id, payload.partner_id,
        payload.form_data, payload.documents,
    )


@router.get("", response_model=list[ApplicationOut])
def my_applications(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return ApplicationService(db).my_applications(current_user)


@router.get("/{application_id}", response_model=ApplicationOut)
def get_application(
    application_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return ApplicationService(db).get_application(current_user, application_id)


@router.get("/{application_id}/messages", response_model=list[ChatMessage])
def list_messages(
    application_id: int,
    after_id: int = Query(0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return ApplicationService(db).list_messages(current_user, application_id, after_id)


@router.post("/{application_id}/messages", response_model=ChatMessage)
def send_message(
    application_id: int,
    payload: MessageCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return ApplicationService(db).send_message(current_user, application_id, payload.body)

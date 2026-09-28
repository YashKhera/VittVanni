from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.auth import get_current_user
from app.models.scheme import Scheme
from app.models.user import User
from app.schemas.scheme import SchemeDetail, SchemeListItem, SchemeListResponse
from app.services.scheme_service import SchemeService

router = APIRouter(prefix="/schemes", tags=["schemes"])


def _to_list_item(s: Scheme) -> SchemeListItem:
    return SchemeListItem.model_validate(s)


@router.get("", response_model=SchemeListResponse)
def list_schemes(
    search: str | None = None,
    sector: str | None = None,
    state: str | None = None,
    support: str | None = None,
    government_level: str | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    schemes, total = SchemeService(db).list(search=search, sector=sector, state=state,
                                           support=support, government_level=government_level,
                                           skip=skip, limit=limit)
    return SchemeListResponse(schemes=[_to_list_item(s) for s in schemes], total=total)


@router.get("/filter", response_model=SchemeListResponse)
def filter_schemes(
    sector: str | None = None,
    state: str | None = None,
    support_type: str | None = None,
    government_level: str | None = None,
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    schemes, total = SchemeService(db).list(sector=sector, state=state, support=support_type,
                                            government_level=government_level)
    return SchemeListResponse(schemes=[_to_list_item(s) for s in schemes], total=total)


@router.get("/stats")
def public_stats(db: Session = Depends(get_db)):
    """Public landing-page counters; no auth required."""
    from app.models.partner_profile import PartnerProfile

    return {
        "schemes": db.query(Scheme).count(),
        "partners": db.query(PartnerProfile).count(),
    }


@router.get("/{scheme_id}", response_model=SchemeDetail)
def get_scheme(scheme_id: int, _: User = Depends(get_current_user), db: Session = Depends(get_db)):
    scheme = SchemeService(db).get(scheme_id)
    return SchemeDetail.model_validate(scheme)
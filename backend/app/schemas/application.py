from datetime import datetime
from typing import Dict, List, Optional

from pydantic import BaseModel


class DocField(BaseModel):
    key: str
    label: str
    sensitive: bool = False
    required: bool = True


class DocSchemaResponse(BaseModel):
    scheme_id: int
    fields: List[DocField]


class ApplicationCreate(BaseModel):
    scheme_id: int
    partner_id: int
    form_data: Dict[str, str] = {}
    documents: Dict[str, str] = {}


class StatusUpdate(BaseModel):
    status: str


class MessageCreate(BaseModel):
    body: str


class ChatMessage(BaseModel):
    id: int
    sender_role: str
    body: str
    mine: bool = False
    created_at: datetime | None = None

    class Config:
        from_attributes = True


class ApplicationOut(BaseModel):
    id: int
    application_no: str
    scheme_id: int
    scheme_name: str = ""
    partner_id: int
    partner_name: str = ""
    status: str
    form_data: Dict[str, str] = {}
    documents: Dict[str, str] = {}
    applicant_email: Optional[str] = None
    applicant_phone: Optional[str] = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class PartnerPublic(BaseModel):
    partner_id: int
    org_name: str = ""
    partner_type: str = ""
    city: str = ""
    state: str = ""
    phone: str = ""


class PartnerProfileUpdate(BaseModel):
    org_name: Optional[str] = None
    partner_type: Optional[str] = None
    phone: Optional[str] = None
    state: Optional[str] = None
    city: Optional[str] = None
    address: Optional[str] = None


class PartnerSchemesUpdate(BaseModel):
    scheme_ids: List[int] = []


class PartnerSchemeInfo(BaseModel):
    scheme_id: int
    scheme_name: str = ""
    total: int = 0
    submitted: int = 0
    under_review: int = 0
    approved: int = 0
    rejected: int = 0


class ApplicantDetail(BaseModel):
    application: ApplicationOut
    full_name: str = ""
    business_name: str = ""
    business_sector: str = ""
    business_stage: str = ""
    state: str = ""
    description: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None

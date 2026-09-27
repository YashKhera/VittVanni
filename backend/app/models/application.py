from datetime import datetime

from sqlalchemy import JSON, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.database import Base

# Lifecycle: submitted -> under_review -> approved | rejected
STATUS_SUBMITTED = "submitted"
STATUS_REVIEW = "under_review"
STATUS_APPROVED = "approved"
STATUS_REJECTED = "rejected"
VALID_STATUSES = {STATUS_SUBMITTED, STATUS_REVIEW, STATUS_APPROVED, STATUS_REJECTED}


class Application(Base):
    """A user's in-portal application for a scheme via a channel partner."""

    __tablename__ = "applications"

    id = Column(Integer, primary_key=True)
    application_no = Column(String(32), unique=True, index=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    scheme_id = Column(Integer, ForeignKey("schemes.id"), index=True, nullable=False)
    partner_id = Column(Integer, ForeignKey("partner_profiles.id"), index=True, nullable=False)

    status = Column(String(20), default=STATUS_SUBMITTED, index=True, nullable=False)

    # Snapshot of the filled form (basic info + business info + document fields).
    form_data = Column(JSON, default=dict)
    # Structured document metadata (numbers/ids as typed; files are out of scope).
    documents = Column(JSON, default=dict)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", backref="applications")
    scheme = relationship("Scheme", backref="applications")
    partner = relationship("PartnerProfile", back_populates="applications")
    messages = relationship(
        "ApplicationMessage", back_populates="application",
        cascade="all, delete-orphan", order_by="ApplicationMessage.id",
    )


class ApplicationMessage(Base):
    """Review-phase chat between the applicant and the assigned partner."""

    __tablename__ = "application_messages"

    id = Column(Integer, primary_key=True)
    application_id = Column(Integer, ForeignKey("applications.id"), index=True, nullable=False)
    sender_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    sender_role = Column(String(20), default="user", nullable=False)  # user | partner
    body = Column(String(2000), nullable=False, default="")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    application = relationship("Application", back_populates="messages")

from datetime import datetime

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.database import Base


class PartnerProfile(Base):
    """Registered channel-partner account profile (one per partner user)."""

    __tablename__ = "partner_profiles"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, index=True, nullable=False)

    org_name = Column(String(255), nullable=False, default="")
    partner_type = Column(String(30), default="other")  # sca | psb | rrb | nbfc_mfi | other
    phone = Column(String(30), nullable=True)
    state = Column(String(50), index=True, nullable=True)
    city = Column(String(100), nullable=True)
    address = Column(String(500), nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", backref="partner_profile", uselist=False)
    schemes = relationship("PartnerScheme", back_populates="partner", cascade="all, delete-orphan")
    applications = relationship("Application", back_populates="partner")

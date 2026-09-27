from sqlalchemy import Column, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import relationship

from app.database import Base


class PartnerScheme(Base):
    """Which schemes a registered partner works with (chosen via dropdown)."""

    __tablename__ = "partner_schemes"
    __table_args__ = (
        UniqueConstraint("partner_id", "scheme_id", name="uq_partner_scheme"),
    )

    id = Column(Integer, primary_key=True)
    partner_id = Column(Integer, ForeignKey("partner_profiles.id"), index=True, nullable=False)
    scheme_id = Column(Integer, ForeignKey("schemes.id"), index=True, nullable=False)

    partner = relationship("PartnerProfile", back_populates="schemes")
    scheme = relationship("Scheme", backref="partner_links")

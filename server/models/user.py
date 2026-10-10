import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String, UniqueConstraint

from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String(320), nullable=False, unique=True, index=True)
    display_name = Column(String(120), nullable=False)
    password_hash = Column(String(256), nullable=False)
    role = Column(String(16), nullable=False, default="survivor")
    phone_number = Column(String(32), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))


class IncidentOwnership(Base):
    __tablename__ = "incident_ownership"
    __table_args__ = (UniqueConstraint("incident_id", name="uq_incident_ownership_incident"),)

    incident_id = Column(
        String(36),
        ForeignKey("incidents.id", ondelete="CASCADE"),
        primary_key=True,
    )
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

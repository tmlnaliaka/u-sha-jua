import uuid
from datetime import datetime, timezone
import enum
from sqlalchemy import Column, String, Text, Float, DateTime, Enum as SQLEnum, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from database import Base, engine

class IncidentType(str, enum.Enum):
    FLOOD = "Flood"
    FIRE = "Fire"
    COLLAPSE = "Collapse"

class UrgencyLevel(str, enum.Enum):
    LOW = "Low"
    MEDIUM = "Medium"
    CRITICAL = "Critical"

class IncidentStatus(str, enum.Enum):
    PENDING = "Pending"
    DISPATCHED = "Dispatched"
    RESOLVED = "Resolved"

# Try importing GeoAlchemy2 if supported by DB
use_geoalchemy = False
if engine.dialect.name == "postgresql":
    try:
        from geoalchemy2 import Geometry
        use_geoalchemy = True
    except ImportError:
        use_geoalchemy = False

class Incident(Base):
    __tablename__ = "incidents"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    raw_text = Column(Text, nullable=False)
    incident_type = Column(SQLEnum(IncidentType), nullable=False, default=IncidentType.FLOOD)
    urgency_level = Column(SQLEnum(UrgencyLevel), nullable=False, default=UrgencyLevel.MEDIUM)
    location_name = Column(String(255), nullable=False)
    
    # Store lat and lon directly for cross-engine reliability & fast indexing
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    
    if use_geoalchemy:
        coordinates = Column(Geometry('POINT', srid=4326), nullable=True)
        
    status = Column(SQLEnum(IncidentStatus), nullable=False, default=IncidentStatus.PENDING)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    review = relationship("IncidentReview", back_populates="incident", uselist=False, cascade="all, delete-orphan")
    evidence = relationship("IncidentEvidence", back_populates="incident", cascade="all, delete-orphan")
    reporter = relationship("IncidentReporter", back_populates="incident", uselist=False, cascade="all, delete-orphan")

    def to_dict(self, evidence_base_url="/api/v1/incidents"):
        review = self.review
        return {
            "id": self.id,
            "raw_text": self.raw_text,
            "incident_type": self.incident_type.value if hasattr(self.incident_type, "value") else self.incident_type,
            "urgency_level": self.urgency_level.value if hasattr(self.urgency_level, "value") else self.urgency_level,
            "location_name": self.location_name,
            "coordinates": {
                "latitude": self.latitude,
                "longitude": self.longitude
            },
            "status": self.status.value if hasattr(self.status, "value") else self.status,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "verification_status": review.verification_status if review else "Unverified",
            "verification_note": review.verification_note if review else None,
            "ai_assessment": review.ai_assessment if review else None,
            "evidence": [
                {
                    "id": item.id,
                    "filename": item.filename,
                    "content_type": item.content_type,
                    "url": f"{evidence_base_url}/{self.id}/evidence/{item.id}",
                    "created_at": item.created_at.isoformat() if item.created_at else None,
                }
                for item in self.evidence
            ],
        }

    def to_geojson_feature(self):
        return {
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [self.longitude, self.latitude]
            },
            "properties": {
                "id": self.id,
                "raw_text": self.raw_text,
                "incident_type": self.incident_type.value if hasattr(self.incident_type, "value") else self.incident_type,
                "urgency_level": self.urgency_level.value if hasattr(self.urgency_level, "value") else self.urgency_level,
                "location_name": self.location_name,
                "status": self.status.value if hasattr(self.status, "value") else self.status,
                "timestamp": self.timestamp.isoformat() if self.timestamp else None,
                "verification_status": self.review.verification_status if self.review else "Unverified",
            }
        }


class IncidentReview(Base):
    __tablename__ = "incident_reviews"

    incident_id = Column(String(36), ForeignKey("incidents.id", ondelete="CASCADE"), primary_key=True)
    verification_status = Column(String(32), nullable=False, default="Unverified")
    verification_note = Column(Text, nullable=True)
    ai_assessment = Column(Text, nullable=True)
    incident = relationship("Incident", back_populates="review")


class IncidentEvidence(Base):
    __tablename__ = "incident_evidence"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    incident_id = Column(String(36), ForeignKey("incidents.id", ondelete="CASCADE"), nullable=False, index=True)
    filename = Column(String(255), nullable=False)
    content_type = Column(String(64), nullable=False)
    storage_key = Column(String(255), nullable=False, unique=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    incident = relationship("Incident", back_populates="evidence")


class IncidentReporter(Base):
    __tablename__ = "incident_reporters"

    incident_id = Column(String(36), ForeignKey("incidents.id", ondelete="CASCADE"), primary_key=True)
    phone_number = Column(String(32), nullable=False)
    sms_opt_in = Column(Boolean, nullable=False, default=False)
    incident = relationship("Incident", back_populates="reporter")

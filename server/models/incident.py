import uuid
from datetime import datetime, timezone
import enum
from sqlalchemy import Column, String, Text, Float, DateTime, Enum as SQLEnum, Index
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
    incident_type = Column(SQLEnum(IncidentType), nullable=False, default=IncidentType.FLOOD, index=True)
    urgency_level = Column(SQLEnum(UrgencyLevel), nullable=False, default=UrgencyLevel.MEDIUM, index=True)
    location_name = Column(String(255), nullable=False)
    
    # Store lat and lon directly for cross-engine reliability & fast spatial indexing
    latitude = Column(Float, nullable=False, index=True)
    longitude = Column(Float, nullable=False, index=True)
    
    if use_geoalchemy:
        coordinates = Column(Geometry('POINT', srid=4326), nullable=True)
        
    status = Column(SQLEnum(IncidentStatus), nullable=False, default=IncidentStatus.PENDING, index=True)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False, index=True)
    dispatched_at = Column(DateTime, nullable=True)
    resolved_at = Column(DateTime, nullable=True)
    attachments = Column(Text, nullable=True, default="[]")

    __table_args__ = (
        Index("idx_incidents_lat_lon", "latitude", "longitude"),
        Index("idx_incidents_status_urgency_ts", "status", "urgency_level", "timestamp"),
        Index("idx_incidents_ts_desc", "timestamp"),
    )


    def to_dict(self):
        import json
        parsed_attachments = []
        if self.attachments:
            try:
                parsed_attachments = json.loads(self.attachments)
            except Exception:
                parsed_attachments = []

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
            "dispatched_at": self.dispatched_at.isoformat() if self.dispatched_at else None,
            "resolved_at": self.resolved_at.isoformat() if self.resolved_at else None,
            "attachments": parsed_attachments
        }

    def to_geojson_feature(self):
        import json
        parsed_attachments = []
        if self.attachments:
            try:
                parsed_attachments = json.loads(self.attachments)
            except Exception:
                parsed_attachments = []

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
                "dispatched_at": self.dispatched_at.isoformat() if self.dispatched_at else None,
                "resolved_at": self.resolved_at.isoformat() if self.resolved_at else None,
                "attachments": parsed_attachments
            }
        }

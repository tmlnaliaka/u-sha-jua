import uuid
import enum
from sqlalchemy import Column, String, Float, Enum as SQLEnum, ForeignKey
from database import Base

class ResponderType(str, enum.Enum):
    AMBULANCE = "Ambulance"
    FIRE_ENGINE = "FireEngine"
    WATER_RESCUE = "WaterRescue"
    SEARCH_RESCUE = "SearchRescue"

class ResponderStatus(str, enum.Enum):
    AVAILABLE = "Available"
    DISPATCHED = "Dispatched"
    ON_SCENE = "OnScene"
    RETURNING = "Returning"

class ResponderUnit(Base):
    __tablename__ = "responder_units"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    callsign = Column(String(64), nullable=False, unique=True)
    unit_type = Column(SQLEnum(ResponderType), nullable=False)
    base_station = Column(String(128), nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    status = Column(SQLEnum(ResponderStatus), nullable=False, default=ResponderStatus.AVAILABLE)
    assigned_incident_id = Column(String(36), nullable=True)
    checklist_json = Column(String(512), nullable=True, default='{"hazard_survey": false, "triage_perimeter": false, "casualty_treatment": false, "evacuation_corridor": false}')

    def to_dict(self):
        import json
        default_checklist = {
            "hazard_survey": False,
            "triage_perimeter": False,
            "casualty_treatment": False,
            "evacuation_corridor": False
        }
        parsed_checklist = default_checklist.copy()
        if self.checklist_json:
            try:
                parsed_checklist.update(json.loads(self.checklist_json))
            except Exception:
                pass

        return {
            "id": self.id,
            "callsign": self.callsign,
            "unit_type": self.unit_type.value if hasattr(self.unit_type, "value") else self.unit_type,
            "base_station": self.base_station,
            "coordinates": {
                "latitude": self.latitude,
                "longitude": self.longitude
            },
            "status": self.status.value if hasattr(self.status, "value") else self.status,
            "assigned_incident_id": self.assigned_incident_id,
            "checklist": parsed_checklist
        }

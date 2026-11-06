from typing import Optional, List
from pydantic import BaseModel, ConfigDict, Field
from models.responder import ResponderType, ResponderStatus

class ResponderCoordinate(BaseModel):
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)

class ResponderUnitCreate(BaseModel):
    callsign: str = Field(..., min_length=2, max_length=64)
    unit_type: ResponderType
    base_station: str = Field(..., min_length=2, max_length=128)
    coordinates: ResponderCoordinate

class ResponderUnitResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    callsign: str
    unit_type: ResponderType
    base_station: str
    coordinates: ResponderCoordinate
    status: ResponderStatus
    assigned_incident_id: Optional[str] = None
    distance_km: Optional[float] = None
    eta_minutes: Optional[int] = None
    checklist: Optional[dict] = None

class ResponderChecklistUpdate(BaseModel):
    checklist: dict

class DispatchAssignmentRequest(BaseModel):
    incident_id: str

class ResponderStatusUpdate(BaseModel):
    status: ResponderStatus

class SurgeSimulationRequest(BaseModel):
    surge_count: int = 3
    hazard_types: Optional[List[str]] = None
    target_hotspot: Optional[str] = None

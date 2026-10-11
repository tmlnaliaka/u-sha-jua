from typing import Optional, List
from pydantic import BaseModel
from models.responder import ResponderType, ResponderStatus

class ResponderCoordinate(BaseModel):
    latitude: float
    longitude: float

class ResponderUnitResponse(BaseModel):
    id: str
    callsign: str
    unit_type: ResponderType
    base_station: str
    coordinates: ResponderCoordinate
    status: ResponderStatus
    assigned_incident_id: Optional[str] = None
    distance_km: Optional[float] = None
    eta_minutes: Optional[int] = None

class DispatchAssignmentRequest(BaseModel):
    incident_id: str

class ResponderStatusUpdate(BaseModel):
    status: ResponderStatus

class SurgeSimulationRequest(BaseModel):
    surge_count: int = 3
    hazard_types: Optional[List[str]] = None
    target_hotspot: Optional[str] = None

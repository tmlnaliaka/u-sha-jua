from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field
from models.incident import IncidentType, UrgencyLevel, IncidentStatus

class CoordinateModel(BaseModel):
    latitude: float = Field(..., ge=-90.0, le=90.0, description="Latitude in EPSG:4326")
    longitude: float = Field(..., ge=-180.0, le=180.0, description="Longitude in EPSG:4326")

class IncidentReportRaw(BaseModel):
    raw_text: str = Field(..., min_length=3, description="Raw civilian distress message or SMS text")
    sender_phone: Optional[str] = Field(
        None,
        pattern=r"^\+[1-9]\d{7,14}$",
        description="Optional phone number in international E.164 format",
    )
    sms_opt_in: bool = False
    device_lat: Optional[float] = Field(None, ge=-90.0, le=90.0, description="Optional GPS latitude from device")
    device_lon: Optional[float] = Field(None, ge=-180.0, le=180.0, description="Optional GPS longitude from device")

class IncidentCreate(BaseModel):
    raw_text: str
    incident_type: IncidentType
    urgency_level: UrgencyLevel
    location_name: str
    coordinates: CoordinateModel
    status: Optional[IncidentStatus] = IncidentStatus.PENDING

class IncidentStatusUpdate(BaseModel):
    status: IncidentStatus

class IncidentEvidenceResponse(BaseModel):
    id: str
    filename: str
    content_type: str
    url: str
    created_at: Optional[datetime] = None

class IncidentResponse(BaseModel):
    id: str
    raw_text: str
    incident_type: IncidentType
    urgency_level: UrgencyLevel
    location_name: str
    coordinates: CoordinateModel
    status: IncidentStatus
    timestamp: datetime
    verification_status: str = "Unverified"
    verification_note: Optional[str] = None
    ai_assessment: Optional[str] = None
    evidence: List[IncidentEvidenceResponse] = Field(default_factory=list)

    class Config:
        from_attributes = True

class IncidentVerificationUpdate(BaseModel):
    status: str = Field(..., pattern="^(Confirmed|Rejected)$")
    note: Optional[str] = Field(None, max_length=1000)

class GeoJSONGeometry(BaseModel):
    type: str = "Point"
    coordinates: List[float] # [lon, lat]

class GeoJSONFeatureProperties(BaseModel):
    id: str
    raw_text: str
    incident_type: IncidentType
    urgency_level: UrgencyLevel
    location_name: str
    status: IncidentStatus
    timestamp: Optional[str] = None
    verification_status: str = "Unverified"

class GeoJSONFeature(BaseModel):
    type: str = "Feature"
    geometry: GeoJSONGeometry
    properties: GeoJSONFeatureProperties

class GeoJSONFeatureCollection(BaseModel):
    type: str = "FeatureCollection"
    features: List[GeoJSONFeature]

from datetime import datetime
from typing import Optional, List, Any, Dict
from pydantic import BaseModel, Field, field_validator, ConfigDict
from models.incident import IncidentType, UrgencyLevel, IncidentStatus
import re

def clean_script_tags(text: str) -> str:
    if not text:
        return ""
    clean = re.sub(r"<\s*script[^>]*>.*?<\s*/\s*script\s*>", "", text, flags=re.IGNORECASE | re.DOTALL)
    clean = re.sub(r"<[^>]+>", "", clean)
    clean = "".join(ch for ch in clean if ch == "\n" or ch == "\t" or (ch >= " " and ord(ch) != 127))
    return clean.strip()[:4000]

class CoordinateModel(BaseModel):
    latitude: float = Field(..., ge=-90.0, le=90.0, description="Latitude in EPSG:4326")
    longitude: float = Field(..., ge=-180.0, le=180.0, description="Longitude in EPSG:4326")

class IncidentReportRaw(BaseModel):
    raw_text: str = Field(..., min_length=3, max_length=4000, description="Raw civilian distress message or SMS text")
    sender_phone: Optional[str] = Field(None, max_length=32, description="Optional civilian contact phone number")
    device_lat: Optional[float] = Field(None, ge=-90.0, le=90.0, description="Optional GPS latitude from device")
    device_lon: Optional[float] = Field(None, ge=-180.0, le=180.0, description="Optional GPS longitude from device")

    @field_validator("raw_text")
    @classmethod
    def sanitize_raw_text(cls, v: str) -> str:
        return clean_script_tags(v)

class IncidentCreate(BaseModel):
    raw_text: str = Field(..., min_length=3, max_length=4000)
    incident_type: IncidentType
    urgency_level: UrgencyLevel
    location_name: str = Field(..., max_length=255)
    coordinates: CoordinateModel
    status: Optional[IncidentStatus] = IncidentStatus.PENDING

    @field_validator("raw_text", "location_name")
    @classmethod
    def sanitize_text(cls, v: str) -> str:
        return clean_script_tags(v)

class IncidentStatusUpdate(BaseModel):
    status: IncidentStatus

class IncidentUpdate(BaseModel):
    raw_text: Optional[str] = Field(None, min_length=3, max_length=4000)
    incident_type: Optional[IncidentType] = None
    urgency_level: Optional[UrgencyLevel] = None
    location_name: Optional[str] = Field(None, max_length=255)
    coordinates: Optional[CoordinateModel] = None
    status: Optional[IncidentStatus] = None

    @field_validator("raw_text", "location_name")
    @classmethod
    def sanitize_optional_text(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            return clean_script_tags(v)
        return None

class IncidentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    raw_text: str
    incident_type: IncidentType
    urgency_level: UrgencyLevel
    location_name: str
    coordinates: CoordinateModel
    status: IncidentStatus
    timestamp: datetime
    dispatched_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None
    attachments: Optional[List[Dict[str, Any]]] = []

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

class GeoJSONFeature(BaseModel):
    type: str = "Feature"
    geometry: GeoJSONGeometry
    properties: GeoJSONFeatureProperties

class GeoJSONFeatureCollection(BaseModel):
    type: str = "FeatureCollection"
    features: List[GeoJSONFeature]

class BatchIncidentReportRaw(BaseModel):
    reports: List[IncidentReportRaw] = Field(..., description="Batch of up to 500 civilian reports")

class BatchIncidentResponse(BaseModel):
    total_processed: int
    successful: int
    incidents: List[IncidentResponse]

class OfflineSyncReport(BaseModel):
    id: Optional[str] = None
    raw_text: str
    incident_type: IncidentType = IncidentType.FLOOD
    urgency_level: UrgencyLevel = UrgencyLevel.MEDIUM
    location_name: str
    latitude: float
    longitude: float
    timestamp: Optional[str] = None

class OfflinePacketSyncRequest(BaseModel):
    device_id: str
    packet_timestamp: str
    incidents: List[OfflineSyncReport]

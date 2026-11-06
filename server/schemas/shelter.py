from typing import Optional
from pydantic import BaseModel, Field, ConfigDict

class ShelterCoordinate(BaseModel):
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)

class ShelterCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=128)
    location_name: str = Field(..., min_length=2, max_length=128)
    coordinates: ShelterCoordinate
    capacity_total: int = Field(..., ge=1, description="Total bed/occupancy capacity")
    occupancy_current: int = Field(0, ge=0, description="Current sheltered count")
    water_supply_status: str = Field("Operational", max_length=32)
    medical_post_available: bool = True
    contact_phone: str = Field("+254 700 000 000", max_length=32)

class ShelterUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=128)
    location_name: Optional[str] = Field(None, min_length=2, max_length=128)
    coordinates: Optional[ShelterCoordinate] = None
    capacity_total: Optional[int] = Field(None, ge=1)
    occupancy_current: Optional[int] = Field(None, ge=0)
    water_supply_status: Optional[str] = Field(None, max_length=32)
    medical_post_available: Optional[bool] = None
    contact_phone: Optional[str] = Field(None, max_length=32)
    is_active: Optional[bool] = None

class ShelterOccupancyUpdate(BaseModel):
    occupancy_current: int = Field(..., ge=0, description="New count of sheltered civilians")

class ShelterResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    location_name: str
    coordinates: ShelterCoordinate
    capacity_total: int
    occupancy_current: int
    available_space: int
    occupancy_percent: float
    water_supply_status: str
    medical_post_available: bool
    contact_phone: str
    is_active: bool


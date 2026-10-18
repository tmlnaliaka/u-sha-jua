import math
import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from database import get_db
from models.shelter import Shelter
from services.security import verify_api_key, ROLE_DISPATCHER, ROLE_ADMIN
from services.audit_service import audit_service
from services.websocket_manager import ws_manager

router = APIRouter(prefix="/shelters", tags=["Evacuation Shelters & Relief"])

DEFAULT_SHELTERS = [
    {
        "name": "Mathare Drive Community Relief Hall",
        "location_name": "Mathare Valley, Nairobi",
        "latitude": -1.2585,
        "longitude": 36.8590,
        "capacity_total": 850,
        "occupancy_current": 320,
        "water_supply_status": "Operational",
        "medical_post_available": True,
        "contact_phone": "+254 722 101 202"
    },
    {
        "name": "Pumwani Social Center & Elevated Muster Point",
        "location_name": "Pumwani / Gikomba Ridge, Nairobi",
        "latitude": -1.2825,
        "longitude": 36.8390,
        "capacity_total": 1200,
        "occupancy_current": 410,
        "water_supply_status": "Operational",
        "medical_post_available": True,
        "contact_phone": "+254 733 404 505"
    },
    {
        "name": "Olympic High Ground Disaster Shelter",
        "location_name": "Kibera Olympic, Nairobi",
        "latitude": -1.3115,
        "longitude": 36.7885,
        "capacity_total": 950,
        "occupancy_current": 680,
        "water_supply_status": "Constrained",
        "medical_post_available": True,
        "contact_phone": "+254 711 707 808"
    },
    {
        "name": "Kwa Njenga Elevated Vocational Shelter",
        "location_name": "Mukuru kwa Njenga, Nairobi",
        "latitude": -1.3175,
        "longitude": 36.8795,
        "capacity_total": 700,
        "occupancy_current": 290,
        "water_supply_status": "Operational",
        "medical_post_available": False,
        "contact_phone": "+254 720 909 001"
    },
    {
        "name": "Jamhuri Park National Relief Base",
        "location_name": "Ngong Road / Jamhuri, Nairobi",
        "latitude": -1.3065,
        "longitude": 36.7620,
        "capacity_total": 3500,
        "occupancy_current": 450,
        "water_supply_status": "Operational",
        "medical_post_available": True,
        "contact_phone": "+254 700 888 999"
    }
]

def seed_shelters(db: Session):
    count = db.query(Shelter).count()
    if count == 0:
        models = [
            Shelter(
                id=str(uuid.uuid4()),
                name=s["name"],
                location_name=s["location_name"],
                latitude=s["latitude"],
                longitude=s["longitude"],
                capacity_total=s["capacity_total"],
                occupancy_current=s["occupancy_current"],
                water_supply_status=s["water_supply_status"],
                medical_post_available=s["medical_post_available"],
                contact_phone=s["contact_phone"],
                is_active=True
            )
            for s in DEFAULT_SHELTERS
        ]
        db.add_all(models)
        db.commit()

def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2.0)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2.0)**2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return round(r * c, 2)

class ShelterOccupancyUpdate(BaseModel):
    occupancy_current: int = Field(..., ge=0, description="New count of sheltered civilians")

@router.get("")
def list_shelters(
    only_with_capacity: bool = Query(False, description="Filter for shelters with remaining space"),
    db: Session = Depends(get_db)
):
    """Lists all emergency evacuation shelters with real-time occupancy and medical status."""
    seed_shelters(db)
    query = db.query(Shelter).filter(Shelter.is_active == True)
    shelters = query.all()
    results = [s.to_dict() for s in shelters]
    if only_with_capacity:
        results = [s for s in results if s["available_space"] > 0]
    return results

@router.get("/nearest")
def find_nearest_shelter(
    latitude: float = Query(..., ge=-90.0, le=90.0),
    longitude: float = Query(..., ge=-180.0, le=180.0),
    db: Session = Depends(get_db)
):
    """Finds the closest operational evacuation shelter with open bed capacity."""
    seed_shelters(db)
    shelters = db.query(Shelter).filter(Shelter.is_active == True).all()
    if not shelters:
        raise HTTPException(status_code=404, detail="No active evacuation shelters registered")

    evaluated = []
    for s in shelters:
        d = s.to_dict()
        dist = haversine_km(latitude, longitude, s.latitude, s.longitude)
        d["distance_km"] = dist
        evaluated.append(d)

    # Rank by open capacity first, then distance
    evaluated.sort(key=lambda x: (x["available_space"] <= 0, x["distance_km"]))
    return evaluated[0] if evaluated else None

@router.patch("/{shelter_id}/occupancy")
async def update_shelter_occupancy(
    shelter_id: str,
    update: ShelterOccupancyUpdate,
    role: str = Depends(verify_api_key([ROLE_DISPATCHER, ROLE_ADMIN])),
    db: Session = Depends(get_db)
):
    """Updates shelter occupancy count and broadcasts evacuation capacity changes."""
    shelter = db.query(Shelter).filter(Shelter.id == shelter_id).first()
    if not shelter:
        raise HTTPException(status_code=404, detail="Shelter not found")

    old_occ = shelter.occupancy_current
    shelter.occupancy_current = update.occupancy_current
    db.commit()
    db.refresh(shelter)

    d = shelter.to_dict()

    audit_service.log_event(
        action="SHELTER_OCCUPANCY_UPDATED",
        actor=role,
        details={"shelter_id": shelter.id, "name": shelter.name, "old": old_occ, "new": shelter.occupancy_current}
    )

    await ws_manager.broadcast("shelter_updated", d)
    return d

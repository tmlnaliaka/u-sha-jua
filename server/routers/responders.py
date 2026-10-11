import math
import uuid
import random
import asyncio
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from database import get_db
from models.responder import ResponderUnit, ResponderType, ResponderStatus
from models.incident import Incident, IncidentStatus, IncidentType, UrgencyLevel
from schemas.responder import (
    ResponderUnitResponse,
    DispatchAssignmentRequest,
    ResponderStatusUpdate,
    SurgeSimulationRequest
)
from services.nlp_service import nlp_service
from services.websocket_manager import ws_manager
from services.spatial_index import spatial_grid, spatial_cache

router = APIRouter(prefix="/responders", tags=["Emergency Responders"])

DEFAULT_FLEET = [
    {
        "callsign": "AMB-01 (Red Cross EOC)",
        "unit_type": ResponderType.AMBULANCE,
        "base_station": "Kenya Red Cross Emergency HQ, South C",
        "latitude": -1.3189,
        "longitude": 36.8300,
    },
    {
        "callsign": "FIRE-01 (Nairobi Central HQ)",
        "unit_type": ResponderType.FIRE_ENGINE,
        "base_station": "City Fire Brigade Station, Tom Mboya St",
        "latitude": -1.2840,
        "longitude": 36.8250,
    },
    {
        "callsign": "RESCUE-01 (Mathare River Taskforce)",
        "unit_type": ResponderType.WATER_RESCUE,
        "base_station": "Mathare Rapid Response Base, Juja Rd",
        "latitude": -1.2580,
        "longitude": 36.8600,
    },
    {
        "callsign": "AMB-02 (St John Ambulances)",
        "unit_type": ResponderType.AMBULANCE,
        "base_station": "St John Ambulance Station, Parliament Rd",
        "latitude": -1.2900,
        "longitude": 36.8220,
    },
    {
        "callsign": "FIRE-02 (Industrial Area Unit)",
        "unit_type": ResponderType.FIRE_ENGINE,
        "base_station": "Industrial Area Fire Base, Enterprise Rd",
        "latitude": -1.3100,
        "longitude": 36.8650,
    },
    {
        "callsign": "SAR-03 (National Disaster Ops)",
        "unit_type": ResponderType.SEARCH_RESCUE,
        "base_station": "National Disaster Operations Centre, Nyayo House",
        "latitude": -1.2880,
        "longitude": 36.8180,
    }
]

def seed_responder_fleet(db: Session):
    count = db.query(ResponderUnit).count()
    if count == 0:
        units = [
            ResponderUnit(
                id=str(uuid.uuid4()),
                callsign=f["callsign"],
                unit_type=f["unit_type"],
                base_station=f["base_station"],
                latitude=f["latitude"],
                longitude=f["longitude"],
                status=ResponderStatus.AVAILABLE
            )
            for f in DEFAULT_FLEET
        ]
        db.add_all(units)
        db.commit()

def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0  # Earth radius in kilometers
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2.0)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2.0)**2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return round(r * c, 2)

def calculate_eta(distance_km: float, speed_kmh: float = 32.0) -> int:
    # Estimate travel time in minutes with 3-minute turnout buffer
    travel_time = (distance_km / speed_kmh) * 60.0
    return max(3, int(round(travel_time + 3.0)))

@router.get("", response_model=List[ResponderUnitResponse])
def get_responders(
    incident_id: Optional[str] = Query(None, description="Optional incident to compute distance & ETA for"),
    db: Session = Depends(get_db)
):
    """Retrieves fleet of active responder units, optionally ranked by proximity to an incident."""
    seed_responder_fleet(db)
    responders = db.query(ResponderUnit).all()

    target_inc = None
    if incident_id:
        target_inc = db.query(Incident).filter(Incident.id == incident_id).first()

    results = []
    for r in responders:
        d = r.to_dict()
        if target_inc:
            dist = haversine_km(r.latitude, r.longitude, target_inc.latitude, target_inc.longitude)
            d["distance_km"] = dist
            d["eta_minutes"] = calculate_eta(dist)
        results.append(d)

    if target_inc:
        # Sort available units closest first, then others
        results.sort(key=lambda x: (x["status"] != "Available", x.get("distance_km") or 999.0))

    return results

@router.post("/{responder_id}/dispatch", response_model=ResponderUnitResponse)
async def dispatch_responder(
    responder_id: str,
    body: DispatchAssignmentRequest,
    db: Session = Depends(get_db)
):
    """
    Dispatches responder unit to an incident:
    1. Updates responder state to Dispatched with assigned incident ID.
    2. Updates incident triage state to Dispatched.
    3. Broadcasts real-time telemetry events to all active dispatch centers.
    """
    responder = db.query(ResponderUnit).filter(ResponderUnit.id == responder_id).first()
    if not responder:
        raise HTTPException(status_code=404, detail="Responder unit not found")

    incident = db.query(Incident).filter(Incident.id == body.incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Target incident not found")

    responder.status = ResponderStatus.DISPATCHED
    responder.assigned_incident_id = incident.id

    incident.status = IncidentStatus.DISPATCHED
    db.commit()
    db.refresh(responder)
    db.refresh(incident)

    inc_dict = incident.to_dict()
    resp_dict = responder.to_dict()

    dist = haversine_km(responder.latitude, responder.longitude, incident.latitude, incident.longitude)
    resp_dict["distance_km"] = dist
    resp_dict["eta_minutes"] = calculate_eta(dist)

    # Sync spatial cache & grid
    spatial_grid.add_or_update(inc_dict)
    spatial_cache.invalidate_all()

    # Broadcast synchronized telemetry
    await ws_manager.broadcast("responder_dispatched", {
        "responder": resp_dict,
        "incident": inc_dict,
        "routing": {
            "origin": [responder.longitude, responder.latitude],
            "destination": [incident.longitude, incident.latitude],
            "distance_km": dist,
            "eta_minutes": resp_dict["eta_minutes"]
        }
    })
    await ws_manager.broadcast("status_updated", inc_dict)

    return resp_dict

@router.patch("/{responder_id}/status", response_model=ResponderUnitResponse)
async def update_responder_status(
    responder_id: str,
    update: ResponderStatusUpdate,
    db: Session = Depends(get_db)
):
    """Updates unit operational readiness (Available, OnScene, Returning)."""
    responder = db.query(ResponderUnit).filter(ResponderUnit.id == responder_id).first()
    if not responder:
        raise HTTPException(status_code=404, detail="Responder unit not found")

    responder.status = update.status
    if update.status == ResponderStatus.AVAILABLE:
        responder.assigned_incident_id = None

    db.commit()
    db.refresh(responder)

    d = responder.to_dict()
    await ws_manager.broadcast("responder_status_updated", d)
    return d

@router.post("/surge-simulate")
async def simulate_crisis_surge(
    req: SurgeSimulationRequest,
    db: Session = Depends(get_db)
):
    """
    Stress-test disaster simulation engine:
    Generates high-density civilian distress calls in Nairobi flood/fire hazard zones.
    """
    SURGE_TEMPLATES = [
        ("Major flash flood engulfing Mathare 4A near Juja Rd, 3 children trapped on rooftops!", -1.2612, 36.8574, "Mathare Valley 4A"),
        ("Raging fire at Gikomba timber market spreading across 8 stalls, intense smoke!", -1.2850, 36.8375, "Gikomba Market"),
        ("Perimeter stone wall collapse in Mukuru kwa Njenga onto pedestrian bridge, 2 injured", -1.3197, 36.8770, "Mukuru kwa Njenga"),
        ("Drainage overflow and flash flooding along Kibera Olympic junction, road cut off", -1.3133, 36.7869, "Kibera Olympic"),
        ("Electrical substation transformer explosion Eastleigh 2nd Ave, active blaze!", -1.2764, 36.8524, "Eastleigh Section 3"),
        ("Foundational cracks and partial stair collapse in 4-storey block Pipeline Embakasi", -1.3150, 36.8994, "Pipeline Estate, Embakasi")
    ]

    count = min(max(req.surge_count, 1), 6)
    selected = random.sample(SURGE_TEMPLATES, count)

    created_incidents = []
    for text, lat, lon, loc_name in selected:
        ext = await nlp_service.extract_distress_report(raw_text=text, device_lat=lat, device_lon=lon)
        inc = Incident(
            id=str(uuid.uuid4()),
            raw_text=text,
            incident_type=ext.incident_type,
            urgency_level=ext.urgency_level,
            location_name=loc_name,
            latitude=lat,
            longitude=lon,
            status=IncidentStatus.PENDING
        )
        created_incidents.append(inc)

    db.add_all(created_incidents)
    db.commit()

    dicts = []
    for inc in created_incidents:
        db.refresh(inc)
        d = inc.to_dict()
        dicts.append(d)
        spatial_grid.add_or_update(d)
        await ws_manager.broadcast("incident_reported", d)

    spatial_cache.invalidate_all()

    return {
        "status": "surge_simulated",
        "injected_count": len(dicts),
        "incidents": dicts
    }

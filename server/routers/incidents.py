import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from database import get_db
from models.incident import Incident, IncidentType, UrgencyLevel, IncidentStatus
from schemas.incident import (
    IncidentReportRaw,
    IncidentCreate,
    IncidentResponse,
    IncidentStatusUpdate,
    GeoJSONFeatureCollection
)
from services.nlp_service import nlp_service
from services.websocket_manager import ws_manager

router = APIRouter(prefix="/incidents", tags=["Incidents"])

@router.post("/report", response_model=IncidentResponse, status_code=status.HTTP_201_CREATED)
async def report_civilian_incident(
    report: IncidentReportRaw,
    db: Session = Depends(get_db)
):
    """
    Ingests raw civilian distress reports (SMS / Web Distress), runs NLP extraction,
    writes coordinates to spatial database, and broadcasts updates to emergency dispatchers.
    """
    extraction = await nlp_service.extract_distress_report(
        raw_text=report.raw_text,
        device_lat=report.device_lat,
        device_lon=report.device_lon
    )

    incident = Incident(
        id=str(uuid.uuid4()),
        raw_text=report.raw_text,
        incident_type=extraction.incident_type,
        urgency_level=extraction.urgency_level,
        location_name=extraction.location_name,
        latitude=extraction.latitude,
        longitude=extraction.longitude,
        status=IncidentStatus.PENDING
    )

    db.add(incident)
    db.commit()
    db.refresh(incident)

    # Broadcast real-time update
    await ws_manager.broadcast("incident_reported", incident.to_dict())

    return incident.to_dict()

@router.post("", response_model=IncidentResponse, status_code=status.HTTP_201_CREATED)
async def create_incident(
    incident_in: IncidentCreate,
    db: Session = Depends(get_db)
):
    """Manual direct dispatch creation endpoint."""
    incident = Incident(
        id=str(uuid.uuid4()),
        raw_text=incident_in.raw_text,
        incident_type=incident_in.incident_type,
        urgency_level=incident_in.urgency_level,
        location_name=incident_in.location_name,
        latitude=incident_in.coordinates.latitude,
        longitude=incident_in.coordinates.longitude,
        status=incident_in.status or IncidentStatus.PENDING
    )
    db.add(incident)
    db.commit()
    db.refresh(incident)

    await ws_manager.broadcast("incident_created", incident.to_dict())
    return incident.to_dict()

@router.get("", response_model=List[IncidentResponse])
def get_incidents(
    incident_type: Optional[IncidentType] = None,
    urgency_level: Optional[UrgencyLevel] = None,
    status_filter: Optional[IncidentStatus] = Query(None, alias="status"),
    db: Session = Depends(get_db)
):
    """Retrieves list of active/historical incidents with filtering."""
    query = db.query(Incident)
    if incident_type:
        query = query.filter(Incident.incident_type == incident_type)
    if urgency_level:
        query = query.filter(Incident.urgency_level == urgency_level)
    if status_filter:
        query = query.filter(Incident.status == status_filter)

    query = query.order_by(Incident.timestamp.desc())
    results = query.all()
    return [r.to_dict() for r in results]

@router.get("/spatial-feed", response_model=GeoJSONFeatureCollection)
def get_spatial_feed(
    min_lat: Optional[float] = Query(None, ge=-90.0, le=90.0),
    max_lat: Optional[float] = Query(None, ge=-90.0, le=90.0),
    min_lon: Optional[float] = Query(None, ge=-180.0, le=180.0),
    max_lon: Optional[float] = Query(None, ge=-180.0, le=180.0),
    status_filter: Optional[IncidentStatus] = Query(None, alias="status"),
    db: Session = Depends(get_db)
):
    """
    Outputs GeoJSON FeatureCollection bounded by requested viewport coordinates.
    Optimized for vector map rendering in Leaflet / Mapbox.
    """
    query = db.query(Incident)

    if min_lat is not None:
        query = query.filter(Incident.latitude >= min_lat)
    if max_lat is not None:
        query = query.filter(Incident.latitude <= max_lat)
    if min_lon is not None:
        query = query.filter(Incident.longitude >= min_lon)
    if max_lon is not None:
        query = query.filter(Incident.longitude <= max_lon)
    if status_filter:
        query = query.filter(Incident.status == status_filter)

    incidents = query.all()
    features = [inc.to_geojson_feature() for inc in incidents]

    return {
        "type": "FeatureCollection",
        "features": features
    }

@router.get("/{incident_id}", response_model=IncidentResponse)
def get_incident(incident_id: str, db: Session = Depends(get_db)):
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    return incident.to_dict()

@router.patch("/{incident_id}/status", response_model=IncidentResponse)
async def update_incident_status(
    incident_id: str,
    update: IncidentStatusUpdate,
    db: Session = Depends(get_db)
):
    """Updates operational triage status (Pending -> Dispatched -> Resolved)."""
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    incident.status = update.status
    db.commit()
    db.refresh(incident)

    # Broadcast status change to live dispatch boards
    await ws_manager.broadcast("status_updated", incident.to_dict())

    return incident.to_dict()

@router.delete("/{incident_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_incident(incident_id: str, db: Session = Depends(get_db)):
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    db.delete(incident)
    db.commit()
    await ws_manager.broadcast("incident_deleted", {"id": incident_id})
    return None

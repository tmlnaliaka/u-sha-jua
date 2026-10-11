import uuid
import asyncio
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status, Response
from sqlalchemy.orm import Session
from database import get_db
from models.incident import Incident, IncidentType, UrgencyLevel, IncidentStatus
from models.responder import ResponderUnit
from schemas.incident import (
    IncidentReportRaw,
    IncidentCreate,
    IncidentResponse,
    IncidentStatusUpdate,
    GeoJSONFeatureCollection,
    BatchIncidentReportRaw,
    BatchIncidentResponse
)
from services.nlp_service import nlp_service
from services.websocket_manager import ws_manager
from services.spatial_index import spatial_grid, spatial_cache

router = APIRouter(prefix="/incidents", tags=["Incidents"])

@router.post("/report", response_model=IncidentResponse, status_code=status.HTTP_201_CREATED)
async def report_civilian_incident(
    report: IncidentReportRaw,
    db: Session = Depends(get_db)
):
    """
    Ingests raw civilian distress reports (SMS / Web Distress), runs NLP extraction,
    writes coordinates to spatial database, updates in-memory spatial index,
    invalidates viewport cache, and broadcasts updates to emergency dispatchers.
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

    inc_dict = incident.to_dict()

    # Synchronize in-memory spatial grid & purge stale viewport cache
    spatial_grid.add_or_update(inc_dict)
    spatial_cache.invalidate_all()

    # Broadcast real-time update
    await ws_manager.broadcast("incident_reported", inc_dict)

    return inc_dict

@router.post("/batch-report", response_model=BatchIncidentResponse, status_code=status.HTTP_201_CREATED)
async def batch_report_civilian_incidents(
    batch: BatchIncidentReportRaw,
    db: Session = Depends(get_db)
):
    """
    High-throughput batch ingestion endpoint for telecom SMS aggregators (e.g. Africa's Talking)
    and emergency command relays. Runs NLP extraction concurrently in parallel workers.
    """
    if not batch.reports:
        return BatchIncidentResponse(total_processed=0, successful=0, incidents=[])

    # Concurrent asynchronous NLP extractions
    tasks = [
        nlp_service.extract_distress_report(
            raw_text=rep.raw_text,
            device_lat=rep.device_lat,
            device_lon=rep.device_lon
        )
        for rep in batch.reports
    ]
    extractions = await asyncio.gather(*tasks, return_exceptions=True)

    created_models = []
    created_dicts = []

    for rep, ext in zip(batch.reports, extractions):
        if isinstance(ext, Exception):
            # Fallback in case of individual task failure
            ext = nlp_service._extract_fallback(rep.raw_text, rep.device_lat, rep.device_lon)

        inc = Incident(
            id=str(uuid.uuid4()),
            raw_text=rep.raw_text,
            incident_type=ext.incident_type,
            urgency_level=ext.urgency_level,
            location_name=ext.location_name,
            latitude=ext.latitude,
            longitude=ext.longitude,
            status=IncidentStatus.PENDING
        )
        created_models.append(inc)

    # Atomic batch insert
    db.add_all(created_models)
    db.commit()

    for inc in created_models:
        db.refresh(inc)
        d = inc.to_dict()
        created_dicts.append(d)
        spatial_grid.add_or_update(d)

    spatial_cache.invalidate_all()

    # Broadcast batch event
    await ws_manager.broadcast("batch_incidents_reported", {
        "count": len(created_dicts),
        "sample": created_dicts[:3]
    })

    return BatchIncidentResponse(
        total_processed=len(batch.reports),
        successful=len(created_dicts),
        incidents=created_dicts
    )

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

    inc_dict = incident.to_dict()
    spatial_grid.add_or_update(inc_dict)
    spatial_cache.invalidate_all()

    await ws_manager.broadcast("incident_created", inc_dict)
    return inc_dict

@router.get("", response_model=List[IncidentResponse])
def get_incidents(
    incident_type: Optional[IncidentType] = None,
    urgency_level: Optional[UrgencyLevel] = None,
    status_filter: Optional[IncidentStatus] = Query(None, alias="status"),
    limit: int = Query(50, ge=1, le=1000, description="Pagination page limit"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    response: Response = None,
    db: Session = Depends(get_db)
):
    """
    Retrieves paginated list of active/historical incidents with index-optimized filtering.
    Sets X-Total-Count response header for client pagination tracking.
    """
    query = db.query(Incident)
    if incident_type:
        query = query.filter(Incident.incident_type == incident_type)
    if urgency_level:
        query = query.filter(Incident.urgency_level == urgency_level)
    if status_filter:
        query = query.filter(Incident.status == status_filter)

    total_count = query.count()
    if response:
        response.headers["X-Total-Count"] = str(total_count)

    query = query.order_by(Incident.timestamp.desc())
    results = query.offset(offset).limit(limit).all()
    return [r.to_dict() for r in results]

@router.get("/spatial-feed", response_model=GeoJSONFeatureCollection)
def get_spatial_feed(
    min_lat: Optional[float] = Query(None, ge=-90.0, le=90.0),
    max_lat: Optional[float] = Query(None, ge=-90.0, le=90.0),
    min_lon: Optional[float] = Query(None, ge=-180.0, le=180.0),
    max_lon: Optional[float] = Query(None, ge=-180.0, le=180.0),
    status_filter: Optional[IncidentStatus] = Query(None, alias="status"),
    limit: int = Query(250, ge=1, le=5000, description="Max vector features to return"),
    db: Session = Depends(get_db)
):
    """
    Outputs GeoJSON FeatureCollection bounded by requested viewport coordinates.
    Accelerated with in-memory SpatialLRUCache and sub-millisecond SpatialGridIndex.
    """
    status_str = status_filter.value if status_filter else None

    # Step 1: Check in-memory SpatialLRUCache (<0.05ms)
    cached_geojson = spatial_cache.get(min_lat, max_lat, min_lon, max_lon, status_str, limit)
    if cached_geojson is not None:
        return cached_geojson

    # Step 2: Check in-memory SpatialGridIndex if populated
    if spatial_grid.size() > 0:
        grid_items = spatial_grid.query_viewport(
            min_lat=min_lat,
            max_lat=max_lat,
            min_lon=min_lon,
            max_lon=max_lon,
            status_filter=status_str,
            limit=limit
        )
        features = [
            {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [item["coordinates"]["longitude"], item["coordinates"]["latitude"]]
                },
                "properties": {
                    "id": item["id"],
                    "raw_text": item["raw_text"],
                    "incident_type": item["incident_type"],
                    "urgency_level": item["urgency_level"],
                    "location_name": item["location_name"],
                    "status": item["status"],
                    "timestamp": item.get("timestamp")
                }
            }
            for item in grid_items
        ]
        geojson = {"type": "FeatureCollection", "features": features}
        spatial_cache.set(min_lat, max_lat, min_lon, max_lon, status_str, limit, geojson)
        return geojson

    # Step 3: Fallback to database query if in-memory grid is cold
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

    query = query.order_by(Incident.timestamp.desc()).limit(limit)
    incidents = query.all()
    features = [inc.to_geojson_feature() for inc in incidents]

    # Populate in-memory grid from query results
    for inc in incidents:
        spatial_grid.add_or_update(inc.to_dict())

    geojson = {
        "type": "FeatureCollection",
        "features": features
    }
    spatial_cache.set(min_lat, max_lat, min_lon, max_lon, status_str, limit, geojson)
    return geojson

@router.get("/cache-metrics", tags=["System"])
def get_cache_metrics():
    """Returns spatial index and LRU cache telemetry."""
    return {
        "grid_indexed_items": spatial_grid.size(),
        "cache_hits": spatial_cache.hits,
        "cache_misses": spatial_cache.misses,
        "cache_hit_rate": round(spatial_cache.hit_rate * 100, 2),
        "nlp_cache_hits": nlp_service.cache.hits,
        "nlp_cache_misses": nlp_service.cache.misses
    }

@router.get("/track/{incident_id}")
def track_civilian_incident(incident_id: str, db: Session = Depends(get_db)):
    """Civilian distress tracking endpoint providing status timeline and responder telemetry."""
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        incident = db.query(Incident).filter(Incident.id.startswith(incident_id)).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident tracking code not found")

    assigned_unit = db.query(ResponderUnit).filter(ResponderUnit.assigned_incident_id == incident.id).first()

    status_val = incident.status.value if hasattr(incident.status, "value") else str(incident.status)
    stages = [
        {"step": 1, "name": "Distress Received & AI Geocoded", "completed": True, "active": False},
        {"step": 2, "name": "EOC Command Triage", "completed": status_val in ["Dispatched", "Resolved"], "active": status_val == "Pending"},
        {"step": 3, "name": "Emergency Unit Dispatched", "completed": status_val == "Resolved", "active": status_val == "Dispatched"},
        {"step": 4, "name": "On Scene & Resolved", "completed": status_val == "Resolved", "active": False}
    ]

    return {
        "incident": incident.to_dict(),
        "assigned_responder": assigned_unit.to_dict() if assigned_unit else None,
        "current_stage": 4 if status_val == "Resolved" else (3 if status_val == "Dispatched" else 2),
        "stages": stages
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

    inc_dict = incident.to_dict()
    spatial_grid.add_or_update(inc_dict)
    spatial_cache.invalidate_all()

    # Broadcast status change to live dispatch boards
    await ws_manager.broadcast("status_updated", inc_dict)

    return inc_dict

@router.delete("/{incident_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_incident(incident_id: str, db: Session = Depends(get_db)):
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    db.delete(incident)
    db.commit()

    spatial_grid.remove(incident_id)
    spatial_cache.invalidate_all()

    await ws_manager.broadcast("incident_deleted", {"id": incident_id})
    return None

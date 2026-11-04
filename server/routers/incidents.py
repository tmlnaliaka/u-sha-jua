import uuid
import math
import asyncio
from typing import List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, status, Response, Request
from sqlalchemy.orm import Session
from database import get_db
from models.incident import Incident, IncidentType, UrgencyLevel, IncidentStatus
from models.responder import ResponderUnit
from models.shelter import Shelter
from schemas.incident import (
    IncidentReportRaw,
    IncidentCreate,
    IncidentResponse,
    IncidentStatusUpdate,
    GeoJSONFeatureCollection,
    BatchIncidentReportRaw,
    BatchIncidentResponse,
    OfflinePacketSyncRequest
)
from services.nlp_service import nlp_service
from services.websocket_manager import ws_manager
from services.spatial_index import spatial_grid, spatial_cache
from services.security import (
    check_rate_limit,
    verify_api_key,
    ROLE_DISPATCHER,
    ROLE_ADMIN,
    mask_pii,
    sanitize_input
)
from services.audit_service import audit_service

router = APIRouter(prefix="/incidents", tags=["Incidents"])

# In-memory Idempotency Cache for resilient mobile / cellular retry deduplication
_idempotency_cache: dict[str, dict] = {}

@router.post("/report", response_model=IncidentResponse, status_code=status.HTTP_201_CREATED)
async def report_civilian_incident(
    report: IncidentReportRaw,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Ingests raw civilian distress reports (SMS / Web Distress), runs NLP extraction,
    writes coordinates to spatial database, updates in-memory spatial index,
    invalidates viewport cache, and broadcasts updates to emergency dispatchers.
    Protected by rate-limiting (60 req/min per IP) and PII masking.
    """
    check_rate_limit(request, max_requests=60, window_seconds=60.0)

    # Check Idempotency-Key header for duplicate submit prevention
    idempotency_key = request.headers.get("Idempotency-Key") or request.headers.get("X-Idempotency-Key")
    if idempotency_key and idempotency_key in _idempotency_cache:
        return _idempotency_cache[idempotency_key]

    clean_text = sanitize_input(report.raw_text, max_len=4000)

    extraction = await nlp_service.extract_distress_report(
        raw_text=clean_text,
        device_lat=report.device_lat,
        device_lon=report.device_lon
    )

    incident = Incident(
        id=str(uuid.uuid4()),
        raw_text=clean_text,
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

    # Log event in cryptographic audit ledger
    audit_service.log_event(
        action="INCIDENT_REPORTED",
        actor="Civilian/Web",
        details={
            "incident_id": incident.id,
            "type": inc_dict["incident_type"],
            "urgency": inc_dict["urgency_level"],
            "location": incident.location_name
        }
    )

    # Broadcast real-time update with PII masked for privacy safety
    inc_broadcast = dict(inc_dict)
    inc_broadcast["raw_text"] = mask_pii(inc_dict["raw_text"])
    await ws_manager.broadcast("incident_reported", inc_broadcast)

    if idempotency_key:
        _idempotency_cache[idempotency_key] = inc_dict

    return inc_dict

@router.post("/batch-report", response_model=BatchIncidentResponse, status_code=status.HTTP_201_CREATED)
async def batch_report_civilian_incidents(
    batch: BatchIncidentReportRaw,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    High-throughput batch ingestion endpoint for telecom SMS aggregators (e.g. Africa's Talking)
    and emergency command relays. Runs NLP extraction concurrently in parallel workers.
    Protected by rate limiting.
    """
    check_rate_limit(request, max_requests=120, window_seconds=60.0)

    if not batch.reports:
        return BatchIncidentResponse(total_processed=0, successful=0, incidents=[])

    clean_reports = []
    for rep in batch.reports:
        rep.raw_text = sanitize_input(rep.raw_text, max_len=4000)
        clean_reports.append(rep)

    tasks = [
        nlp_service.extract_distress_report(
            raw_text=rep.raw_text,
            device_lat=rep.device_lat,
            device_lon=rep.device_lon
        )
        for rep in clean_reports
    ]
    extractions = await asyncio.gather(*tasks, return_exceptions=True)

    created_models = []
    created_dicts = []

    for rep, ext in zip(clean_reports, extractions):
        if isinstance(ext, Exception):
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

    db.add_all(created_models)
    db.commit()

    for inc in created_models:
        db.refresh(inc)
        d = inc.to_dict()
        created_dicts.append(d)
        spatial_grid.add_or_update(d)

    spatial_cache.invalidate_all()

    audit_service.log_event(
        action="BATCH_INCIDENTS_REPORTED",
        actor="Telecom/Aggregator",
        details={"count": len(created_dicts)}
    )

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
    role: str = Depends(verify_api_key([ROLE_DISPATCHER, ROLE_ADMIN])),
    db: Session = Depends(get_db)
):
    """Manual direct dispatch creation endpoint (requires Dispatcher or Admin role)."""
    incident = Incident(
        id=str(uuid.uuid4()),
        raw_text=sanitize_input(incident_in.raw_text),
        incident_type=incident_in.incident_type,
        urgency_level=incident_in.urgency_level,
        location_name=sanitize_input(incident_in.location_name, max_len=255),
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

    audit_service.log_event(
        action="MANUAL_INCIDENT_CREATED",
        actor=role,
        details={"incident_id": incident.id, "type": str(incident.incident_type), "location": incident.location_name}
    )

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

@router.get("/{incident_id}/hazard-perimeter")
def get_incident_hazard_perimeter(incident_id: str, db: Session = Depends(get_db)):
    """
    Computes dynamic GeoJSON hazard perimeter polygon, estimated population at risk,
    and nearest open evacuation shelter for early-warning threat modeling.
    """
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    urgency_val = incident.urgency_level.value if hasattr(incident.urgency_level, "value") else str(incident.urgency_level)
    type_val = incident.incident_type.value if hasattr(incident.incident_type, "value") else str(incident.incident_type)

    # Calculate dynamic hazard radius in meters and degrees (~111,000m per degree latitude)
    if urgency_val == "Critical":
        radius_m = 950.0 if type_val == "Flood" else (700.0 if type_val == "Fire" else 500.0)
    elif urgency_val == "Medium":
        radius_m = 400.0
    else:
        radius_m = 200.0

    radius_deg_lat = radius_m / 111320.0
    radius_deg_lon = radius_m / (111320.0 * math.cos(math.radians(incident.latitude)))

    # Generate 16-point circular polygon
    coordinates = []
    points = 16
    for i in range(points + 1):
        angle = (2.0 * math.pi * i) / points
        lat_pt = incident.latitude + (radius_deg_lat * math.sin(angle))
        lon_pt = incident.longitude + (radius_deg_lon * math.cos(angle))
        coordinates.append([round(lon_pt, 6), round(lat_pt, 6)])

    # Population density estimate (~18 people per 100m² in high-density informal settlement)
    area_sq_m = math.pi * (radius_m ** 2)
    estimated_pop = int((area_sq_m / 10000.0) * 850)

    # Find nearest active evacuation shelter
    shelters = db.query(Shelter).filter(Shelter.is_active == True).all()
    nearest_shelter = None
    min_dist = float("inf")
    for s in shelters:
        # Haversine
        dlat = math.radians(s.latitude - incident.latitude)
        dlon = math.radians(s.longitude - incident.longitude)
        a = math.sin(dlat / 2.0)**2 + math.cos(math.radians(incident.latitude)) * math.cos(math.radians(s.latitude)) * math.sin(dlon / 2.0)**2
        c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
        dist_km = 6371.0 * c
        if dist_km < min_dist:
            min_dist = dist_km
            nearest_shelter = s.to_dict()
            nearest_shelter["distance_km"] = round(dist_km, 2)

    return {
        "type": "Feature",
        "geometry": {
            "type": "Polygon",
            "coordinates": [coordinates]
        },
        "properties": {
            "incident_id": incident.id,
            "location_name": incident.location_name,
            "incident_type": type_val,
            "urgency_level": urgency_val,
            "radius_meters": radius_m,
            "area_sq_meters": round(area_sq_m, 1),
            "estimated_population_impacted": estimated_pop,
            "nearest_evacuation_shelter": nearest_shelter,
            "evacuation_advisory": (
                f"IMMEDIATE EVACUATION: Establish {int(radius_m)}m cordon around {incident.location_name}. "
                f"Direct civilian foot traffic toward {nearest_shelter['name'] if nearest_shelter else 'designated high grounds'}."
            )
        }
    }


@router.get("/{incident_id}/cap-alert")
def get_incident_oasis_cap_alert(incident_id: str, db: Session = Depends(get_db)):
    """
    OASIS Common Alerting Protocol (CAP v1.2 / ITU-T X.1303 bis) Alert Generator.
    Why: Interagency crisis platforms (Kenya Met Dept, Red Cross, UN OCHA) require
    standardized CAP v1.2 emergency alerts containing urgency, severity, certainty,
    and WGS-84 circle/polygon geometries.
    """
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    perim = get_incident_hazard_perimeter(incident_id, db)
    props = perim["properties"]
    urgency_val = props["urgency_level"]
    type_val = props["incident_type"]
    radius_km = round(props["radius_meters"] / 1000.0, 3)

    cap_category = "Met" if type_val == "Flood" else ("Fire" if type_val == "Fire" else "Infra")
    cap_urgency = "Immediate" if urgency_val == "Critical" else ("Expected" if urgency_val == "Medium" else "Future")
    cap_severity = "Extreme" if urgency_val == "Critical" else ("Severe" if urgency_val == "Medium" else "Moderate")
    sent_iso = (incident.timestamp or datetime.now(timezone.utc)).isoformat()
    identifier = f"USHAJUA-CAP-{incident.id}"
    headline = f"{urgency_val.upper()} {type_val.upper()} ALERT — {incident.location_name}"
    circle_str = f"{incident.latitude},{incident.longitude} {radius_km}"
    ring_coords = perim["geometry"]["coordinates"][0]
    polygon_str = " ".join(f"{pt[1]},{pt[0]}" for pt in ring_coords)

    xml_payload = (
        f'<?xml version="1.0" encoding="UTF-8"?>\n'
        f'<alert xmlns="urn:oasis:names:tc:emergency:cap:1.2">\n'
        f'  <identifier>{identifier}</identifier>\n'
        f'  <sender>eoc@ushajua.go.ke</sender>\n'
        f'  <sent>{sent_iso}</sent>\n'
        f'  <status>Actual</status>\n'
        f'  <msgType>Alert</msgType>\n'
        f'  <scope>Public</scope>\n'
        f'  <info>\n'
        f'    <category>{cap_category}</category>\n'
        f'    <event>{type_val} Emergency</event>\n'
        f'    <urgency>{cap_urgency}</urgency>\n'
        f'    <severity>{cap_severity}</severity>\n'
        f'    <certainty>Observed</certainty>\n'
        f'    <headline>{headline}</headline>\n'
        f'    <description>{incident.raw_text}</description>\n'
        f'    <instruction>{props["evacuation_advisory"]}</instruction>\n'
        f'    <area>\n'
        f'      <areaDesc>{incident.location_name}</areaDesc>\n'
        f'      <circle>{circle_str}</circle>\n'
        f'      <polygon>{polygon_str}</polygon>\n'
        f'    </area>\n'
        f'  </info>\n'
        f'</alert>'
    )

    return {
        "identifier": identifier,
        "sender": "eoc@ushajua.go.ke",
        "sent": sent_iso,
        "status": "Actual",
        "msgType": "Alert",
        "scope": "Public",
        "info": {
            "category": cap_category,
            "event": f"{type_val} Emergency",
            "urgency": cap_urgency,
            "severity": cap_severity,
            "certainty": "Observed",
            "headline": headline,
            "description": incident.raw_text,
            "instruction": props["evacuation_advisory"],
            "area": {
                "areaDesc": incident.location_name,
                "circle": circle_str,
                "polygon": polygon_str
            }
        },
        "xml": xml_payload
    }

@router.post("/sync/offline-packet")
async def sync_offline_distress_packet(
    packet: OfflinePacketSyncRequest,
    db: Session = Depends(get_db)
):
    """
    Offline Emergency Mesh Synchronizer:
    Ingests incident distress packets collected by field workers during cellular blackouts
    via LoRa, ad-hoc Wi-Fi, or Bluetooth mesh. Deduplicates and merges state.
    """
    ingested = 0
    updated = 0
    new_incidents = []

    for item in packet.incidents:
        inc_id = item.id or str(uuid.uuid4())
        existing = db.query(Incident).filter(Incident.id == inc_id).first()
        if existing:
            # Already exists in ledger
            updated += 1
            continue

        ts = datetime.fromisoformat(item.timestamp) if item.timestamp else datetime.now(timezone.utc)
        new_inc = Incident(
            id=inc_id,
            raw_text=sanitize_input(item.raw_text),
            incident_type=item.incident_type,
            urgency_level=item.urgency_level,
            location_name=sanitize_input(item.location_name),
            latitude=item.latitude,
            longitude=item.longitude,
            status=IncidentStatus.PENDING,
            timestamp=ts
        )
        new_incidents.append(new_inc)
        ingested += 1

    if new_incidents:
        db.add_all(new_incidents)
        db.commit()
        for inc in new_incidents:
            db.refresh(inc)
            d = inc.to_dict()
            spatial_grid.add_or_update(d)
        spatial_cache.invalidate_all()

    audit_service.log_event(
        action="OFFLINE_PACKET_SYNCED",
        actor=f"MeshNode/{packet.device_id}",
        details={"ingested_count": ingested, "packet_ts": packet.packet_timestamp}
    )

    return {
        "status": "synchronized",
        "device_id": packet.device_id,
        "newly_ingested": ingested,
        "already_synced": updated
    }

@router.get("/export/offline-bundle")
def export_offline_crisis_bundle(db: Session = Depends(get_db)):
    """
    Generates a portable, high-density JSON offline bundle containing all active incidents,
    designated evacuation shelters, and high-hazard flood polygons for disconnected field tablets.
    """
    incidents = db.query(Incident).filter(Incident.status != IncidentStatus.RESOLVED).all()
    shelters = db.query(Shelter).filter(Shelter.is_active == True).all()

    return {
        "bundle_version": "1.3.0-mesh",
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "active_incidents": [i.to_dict() for i in incidents],
        "shelters": [s.to_dict() for s in shelters],
        "security_checksum": audit_service.verify_integrity().get("latest_hash")
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
    role: str = Depends(verify_api_key([ROLE_DISPATCHER, ROLE_ADMIN])),
    db: Session = Depends(get_db)
):
    """Updates operational triage status (Pending -> Dispatched -> Resolved). Requires authorized role."""
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    old_status = incident.status
    incident.status = update.status
    db.commit()
    db.refresh(incident)

    inc_dict = incident.to_dict()
    spatial_grid.add_or_update(inc_dict)
    spatial_cache.invalidate_all()

    audit_service.log_event(
        action="INCIDENT_STATUS_CHANGED",
        actor=role,
        details={"incident_id": incident.id, "old": str(old_status), "new": str(update.status)}
    )

    await ws_manager.broadcast("status_updated", inc_dict)

    return inc_dict

@router.delete("/{incident_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_incident(
    incident_id: str,
    role: str = Depends(verify_api_key([ROLE_ADMIN])),
    db: Session = Depends(get_db)
):
    """Deletes an incident from the ledger. Requires Admin role and logs to audit trail."""
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    inc_info = {"id": incident.id, "location": incident.location_name}
    db.delete(incident)
    db.commit()

    spatial_grid.remove(incident_id)
    spatial_cache.invalidate_all()

    audit_service.log_event(
        action="INCIDENT_DELETED",
        actor=role,
        details=inc_info
    )

    await ws_manager.broadcast("incident_deleted", {"id": incident_id})
    return None

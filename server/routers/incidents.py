import uuid
import logging
import secrets
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
import httpx
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, selectinload
from config import settings
from database import get_db
from models.incident import Incident, IncidentType, UrgencyLevel, IncidentStatus, IncidentEvidence, IncidentReview, IncidentReporter
from schemas.incident import (
    IncidentReportRaw,
    IncidentCreate,
    IncidentResponse,
    IncidentStatusUpdate,
    GeoJSONFeatureCollection,
    IncidentVerificationUpdate,
)
from services.nlp_service import nlp_service
from services.evidence_service import evidence_path, persist_evidence, read_evidence, remove_evidence
from services.sms_service import send_sms
from services.websocket_manager import ws_manager

router = APIRouter(prefix="/incidents", tags=["Incidents"])
logger = logging.getLogger("incident_router")

async def _notify_reporter(phone_number: str, message: str, incident_id: str) -> None:
    try:
        await send_sms(phone_number, message)
    except (RuntimeError, ValueError, httpx.HTTPError) as exc:
        logger.warning("SMS notification failed for incident %s: %s", incident_id, exc)


async def _create_civilian_report(
    report: IncidentReportRaw,
    db: Session,
    uploaded_files: Optional[list[tuple[str, str, bytes]]] = None,
    sms_initiated: bool = False,
):
    extraction = await nlp_service.extract_distress_report(
        raw_text=report.raw_text,
        device_lat=report.device_lat,
        device_lon=report.device_lon
    )
    uploaded_files = uploaded_files or []
    ai_assessment = await nlp_service.assess_visual_evidence(
        [(content_type, content) for _, content_type, content in uploaded_files]
    )
    has_photo = any(content_type.startswith("image/") for _, content_type, _ in uploaded_files)
    evidence_note = ai_assessment
    if uploaded_files and not ai_assessment:
        evidence_note = (
            "Automated photo review is unavailable or no photo was analyzed. "
            "This evidence has not been verified; inspect the media manually."
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
    if evidence_note:
        incident.review = IncidentReview(
            verification_status="Provisional" if ai_assessment and has_photo else "Unverified",
            ai_assessment=evidence_note,
        )
    if report.sender_phone:
        incident.reporter = IncidentReporter(
            phone_number=report.sender_phone,
            sms_opt_in=report.sms_opt_in or sms_initiated,
        )

    storage_keys = []
    try:
        for filename, content_type, content in uploaded_files:
            storage_key = persist_evidence(content, Path(filename).suffix.lower())
            storage_keys.append(storage_key)
            incident.evidence.append(
                IncidentEvidence(
                    filename=filename,
                    content_type=content_type,
                    storage_key=storage_key,
                )
            )
        db.commit()
        db.refresh(incident)
    except (SQLAlchemyError, OSError) as exc:
        db.rollback()
        for storage_key in storage_keys:
            try:
                remove_evidence(storage_key)
            except OSError as cleanup_error:
                logger.error("Could not remove uncommitted evidence file: %s", cleanup_error)
        logger.error("Could not save report or its evidence: %s", exc)
        raise HTTPException(status_code=500, detail="Could not save this report and its evidence.") from exc

    # Broadcast real-time update
    await ws_manager.broadcast("incident_reported", incident.to_dict())

    if incident.reporter and incident.reporter.sms_opt_in:
        await _notify_reporter(
            incident.reporter.phone_number,
            f"u-SHA-jua received your report for {incident.location_name}. It is awaiting dispatcher verification; this message does not confirm the incident.",
            incident.id,
        )
    return incident.to_dict()


@router.post("/report", response_model=IncidentResponse, status_code=status.HTTP_201_CREATED)
async def report_civilian_incident(
    report: IncidentReportRaw,
    db: Session = Depends(get_db)
):
    """Ingest a civilian report submitted as JSON or SMS-compatible text."""
    return await _create_civilian_report(report, db)


@router.post("/report-with-media", response_model=IncidentResponse, status_code=status.HTTP_201_CREATED)
async def report_civilian_incident_with_media(
    raw_text: str = Form(..., min_length=3),
    sender_phone: Optional[str] = Form(None),
    sms_opt_in: bool = Form(False),
    device_lat: Optional[float] = Form(None, ge=-90.0, le=90.0),
    device_lon: Optional[float] = Form(None, ge=-180.0, le=180.0),
    files: List[UploadFile] = File(default=[]),
    db: Session = Depends(get_db),
):
    if len(files) > 6:
        raise HTTPException(status_code=413, detail="Attach no more than 6 evidence files.")
    uploaded_files = [await read_evidence(file) for file in files]
    report = IncidentReportRaw(
        raw_text=raw_text,
        sender_phone=sender_phone,
        sms_opt_in=sms_opt_in,
        device_lat=device_lat,
        device_lon=device_lon,
    )
    return await _create_civilian_report(report, db, uploaded_files)

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
    query = db.query(Incident).options(
        selectinload(Incident.review),
        selectinload(Incident.evidence),
    )
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
    incident = db.query(Incident).options(
        selectinload(Incident.review),
        selectinload(Incident.evidence),
        selectinload(Incident.reporter),
    ).filter(Incident.id == incident_id).first()
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

    if incident.reporter and incident.reporter.sms_opt_in:
        await _notify_reporter(
            incident.reporter.phone_number,
            f"u-SHA-jua update for {incident.location_name}: response status is {incident.status.value}. Follow dispatcher instructions.",
            incident.id,
        )
    return incident.to_dict()


@router.patch("/{incident_id}/verification", response_model=IncidentResponse)
async def update_incident_verification(
    incident_id: str,
    update: IncidentVerificationUpdate,
    dispatcher_token: Optional[str] = Header(None, alias="X-Dispatcher-Token"),
    db: Session = Depends(get_db),
):
    expected_token = settings.DISPATCHER_API_TOKEN
    if not expected_token:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Dispatcher verification is not configured.",
        )
    if not secrets.compare_digest(dispatcher_token or "", expected_token):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Dispatcher authorization required.")

    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    if incident.review is None:
        incident.review = IncidentReview()
    incident.review.verification_status = update.status
    incident.review.verification_note = update.note
    db.commit()
    db.refresh(incident)
    await ws_manager.broadcast("verification_updated", incident.to_dict())
    return incident.to_dict()


@router.get("/{incident_id}/evidence/{evidence_id}")
def get_incident_evidence(
    incident_id: str,
    evidence_id: str,
    db: Session = Depends(get_db),
):
    evidence = db.query(IncidentEvidence).filter(
        IncidentEvidence.id == evidence_id,
        IncidentEvidence.incident_id == incident_id,
    ).first()
    if not evidence:
        raise HTTPException(status_code=404, detail="Evidence not found")
    try:
        path = evidence_path(evidence.storage_key)
    except ValueError as exc:
        raise HTTPException(status_code=500, detail="Evidence storage reference is invalid") from exc
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Evidence file is unavailable")
    return FileResponse(
        path,
        media_type=evidence.content_type,
        filename=evidence.filename,
        content_disposition_type="inline",
    )

@router.delete("/{incident_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_incident(incident_id: str, db: Session = Depends(get_db)):
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    storage_keys = [item.storage_key for item in incident.evidence]
    db.delete(incident)
    db.commit()
    for storage_key in storage_keys:
        remove_evidence(storage_key)
    await ws_manager.broadcast("incident_deleted", {"id": incident_id})
    return None

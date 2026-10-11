import uuid
import logging
from typing import Optional
from fastapi import APIRouter, Depends, Form, Request, status
from sqlalchemy.orm import Session
from database import get_db
from models.incident import Incident, IncidentStatus
from services.nlp_service import nlp_service
from services.websocket_manager import ws_manager
from services.spatial_index import spatial_grid, spatial_cache

logger = logging.getLogger("sms_router")
router = APIRouter(prefix="/sms", tags=["Telecom SMS Gateway"])

@router.post("/incoming", status_code=status.HTTP_200_OK)
async def incoming_sms_webhook(
    request: Request,
    db: Session = Depends(get_db)
):
    """
    High-availability webhook for Africa's Talking / Twilio incoming civilian SMS.
    Accepts both form-encoded and JSON webhook payloads.
    Responds with HTTP 200 within <50ms to satisfy telecom carrier gateway SLA.
    """
    raw_text = ""
    sender_phone = None

    content_type = request.headers.get("content-type", "")
    if "application/json" in content_type:
        body = await request.json()
        raw_text = body.get("text") or body.get("message") or body.get("raw_text", "")
        sender_phone = body.get("from") or body.get("sender_phone") or body.get("phone")
    else:
        form = await request.form()
        raw_text = form.get("text") or form.get("message") or ""
        sender_phone = form.get("from") or form.get("phoneNumber") or None

    if not raw_text or len(raw_text.strip()) < 3:
        return {"status": "ignored", "reason": "empty or invalid message"}

    # Run fast-path NLP extraction
    extraction = await nlp_service.extract_distress_report(raw_text=raw_text)

    incident = Incident(
        id=str(uuid.uuid4()),
        raw_text=raw_text,
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
    spatial_grid.add_or_update(inc_dict)
    spatial_cache.invalidate_all()

    # Real-time WebSocket push
    await ws_manager.broadcast("incident_reported", inc_dict)

    logger.info(f"Ingested incoming SMS from {sender_phone}: {raw_text[:40]}...")

    return {
        "status": "success",
        "incident_id": incident.id,
        "urgency": extraction.urgency_level.value,
        "geocoded_location": extraction.location_name
    }

@router.get("/incoming")
def sms_webhook_health():
    """Webhook verification check for telecom carrier provisioning."""
    return {"status": "ready", "gateway": "Africa's Talking / u-SHA-jua SMS Gateway"}

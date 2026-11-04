import uuid
import logging
import hmac
import hashlib
from typing import Optional
from fastapi import APIRouter, Depends, Form, Request, status, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from config import settings
from models.incident import Incident, IncidentStatus
from services.nlp_service import nlp_service
from services.websocket_manager import ws_manager
from services.spatial_index import spatial_grid, spatial_cache
from services.security import check_rate_limit, mask_pii, sanitize_input
from services.audit_service import audit_service

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
    Includes carrier secret validation, rate limiting, and PII masking.
    Responds with HTTP 200 within <50ms to satisfy telecom carrier gateway SLA.
    """
    # Rate limit telecom endpoint (up to 300 requests/minute per carrier IP)
    check_rate_limit(request, max_requests=300, window_seconds=60.0)

    # If webhook secret is configured, enforce constant-time cryptographic verification
    if settings.SMS_WEBHOOK_SECRET:
        secret_header = request.headers.get("X-Webhook-Secret") or request.query_params.get("secret")
        signature_header = request.headers.get("X-Hub-Signature-256") or request.headers.get("X-AT-Signature")
        
        is_valid = False
        if secret_header:
            is_valid = hmac.compare_digest(secret_header, settings.SMS_WEBHOOK_SECRET)
        elif signature_header:
            body_bytes = await request.body()
            computed = "sha256=" + hmac.new(settings.SMS_WEBHOOK_SECRET.encode(), body_bytes, hashlib.sha256).hexdigest()
            is_valid = hmac.compare_digest(signature_header, computed)
            
        if not is_valid:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid webhook signature")

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

    clean_text = sanitize_input(raw_text, max_len=1000)

    if not clean_text or len(clean_text.strip()) < 3:
        return {"status": "ignored", "reason": "empty or invalid message"}

    # Run fast-path NLP extraction
    extraction = await nlp_service.extract_distress_report(raw_text=clean_text)

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
    spatial_grid.add_or_update(inc_dict)
    spatial_cache.invalidate_all()

    # Log to cryptographic audit trail
    masked_phone = mask_pii(sender_phone) if sender_phone else "Unknown"
    audit_service.log_event(
        action="SMS_INCIDENT_INGESTED",
        actor="Telecom/SMS",
        details={
            "incident_id": incident.id,
            "sender": masked_phone,
            "type": inc_dict["incident_type"],
            "urgency": inc_dict["urgency_level"],
            "location": incident.location_name
        }
    )

    # Real-time WebSocket push with PII masking
    broadcast_payload = dict(inc_dict)
    broadcast_payload["raw_text"] = mask_pii(clean_text)
    await ws_manager.broadcast("incident_reported", broadcast_payload)

    logger.info(f"Ingested incoming SMS from {masked_phone}: {clean_text[:40]}...")

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

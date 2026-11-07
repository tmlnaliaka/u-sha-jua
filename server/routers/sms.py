import uuid
import logging
import hmac
import hashlib
from typing import Optional
from fastapi import APIRouter, Depends, Form, Request, status, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from database import get_db
from config import settings
from models.incident import Incident, IncidentStatus
from services.nlp_service import nlp_service
from services.websocket_manager import ws_manager
from services.spatial_index import spatial_grid, spatial_cache
from services.security import check_rate_limit, mask_pii, sanitize_input, verify_api_key, ROLE_DISPATCHER, ROLE_ADMIN
from services.audit_service import audit_service
from services.sms_service import sms_gateway

logger = logging.getLogger("sms_router")
router = APIRouter(prefix="/sms", tags=["Telecom SMS Gateway"])

class OutboundSMSRequest(BaseModel):
    to_phone: str = Field(..., min_length=7, max_length=25, description="Target recipient telephone number")
    message: str = Field(..., min_length=1, max_length=480, description="SMS text body")
    idempotency_key: Optional[str] = Field(None, description="Optional caller idempotency key to prevent double delivery")

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

    # If webhook secret is configured or in strict mode, enforce constant-time cryptographic verification
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
    elif settings.ENFORCE_STRICT_AUTH or settings.ENVIRONMENT == "production":
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Telecom gateway webhook unconfigured. SMS_WEBHOOK_SECRET must be set in production."
        )

    carrier_msg_id = (
        request.headers.get("X-Carrier-Message-Id") or
        request.headers.get("Idempotency-Key") or
        request.headers.get("X-Message-Id")
    )
    raw_text = ""
    sender_phone = None

    content_type = request.headers.get("content-type", "")
    if "application/json" in content_type:
        body = await request.json()
        raw_text = body.get("text") or body.get("message") or body.get("raw_text", "")
        sender_phone = body.get("from") or body.get("sender_phone") or body.get("phone")
        carrier_msg_id = carrier_msg_id or body.get("message_id") or body.get("messageId") or body.get("id") or body.get("smsId")
    else:
        form = await request.form()
        raw_text = form.get("text") or form.get("message") or ""
        sender_phone = form.get("from") or form.get("phoneNumber") or None
        carrier_msg_id = carrier_msg_id or form.get("message_id") or form.get("messageId") or form.get("id") or form.get("smsId")

    # Inbound Carrier Idempotency Guarantee
    if carrier_msg_id:
        existing_id = sms_gateway.check_inbound_idempotency(str(carrier_msg_id))
        if existing_id:
            existing_inc = db.query(Incident).filter(Incident.id == existing_id).first()
            return {
                "status": "success",
                "idempotent_replay": True,
                "incident_id": existing_id,
                "urgency": existing_inc.urgency_level.value if existing_inc else "Medium",
                "geocoded_location": existing_inc.location_name if existing_inc else "Cached"
            }

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

    # Record message ID in idempotency store
    if carrier_msg_id:
        sms_gateway.record_inbound_idempotency(str(carrier_msg_id), incident.id)

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
            "location": incident.location_name,
            "carrier_msg_id": carrier_msg_id
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

@router.post("/outbound", status_code=status.HTTP_200_OK)
async def dispatch_outbound_sms(
    payload: OutboundSMSRequest,
    role: str = Depends(verify_api_key([ROLE_DISPATCHER, ROLE_ADMIN]))
):
    """
    Dispatches outbound crisis alerts or dispatch progress notifications via SMS.
    Enforces role authorization, caller idempotency, and carrier timeout resilience.
    """
    try:
        res = await sms_gateway.send_sms(
            to_phone=payload.to_phone,
            message_body=payload.message,
            idempotency_key=payload.idempotency_key
        )
        return res
    except TimeoutError as te:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail=f"Telecom gateway timeout: {str(te)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Telecom provider transmission failure: {str(e)}"
        )

@router.get("/incoming")
def sms_webhook_health():
    """Webhook verification check for telecom carrier provisioning."""
    return {"status": "ready", "gateway": "Africa's Talking / u-SHA-jua SMS Gateway"}

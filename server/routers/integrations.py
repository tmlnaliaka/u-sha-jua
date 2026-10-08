import logging
import secrets
from typing import Optional

from fastapi import APIRouter, Depends, Form, Header, HTTPException, Query, status, Response
from sqlalchemy.orm import Session

from config import settings
from database import get_db
from routers.incidents import _create_civilian_report
from schemas.incident import IncidentReportRaw

logger = logging.getLogger("africastalking_webhook")
router = APIRouter(prefix="/integrations/africastalking", tags=["Integrations"])


@router.post("/sms", status_code=status.HTTP_200_OK)
async def receive_africastalking_sms(
    phone_number: str = Form(..., alias="phoneNumber"),
    text: str = Form(..., min_length=3),
    webhook_token: Optional[str] = Query(None, alias="token"),
    token_header: Optional[str] = Header(None, alias="X-Webhook-Token"),
    db: Session = Depends(get_db),
) -> Response:
    expected_token = settings.AFRICASTALKING_WEBHOOK_TOKEN
    supplied_token = token_header or webhook_token or ""
    if not expected_token:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Africa's Talking SMS intake is not configured.",
        )
    if not secrets.compare_digest(supplied_token, expected_token):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid webhook token.")

    report = IncidentReportRaw(raw_text=text, sender_phone=phone_number)
    incident = await _create_civilian_report(report, db, sms_initiated=True)
    logger.info("Accepted inbound Africa's Talking report as incident %s", incident["id"])
    return Response(status_code=status.HTTP_200_OK)

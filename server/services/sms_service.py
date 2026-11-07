import os
import time
import logging
import threading
from typing import Dict, Any, Optional
from collections import OrderedDict
import httpx
from config import settings
from services.audit_service import audit_service
from services.security import mask_pii

logger = logging.getLogger("sms_service")

class SMSGatewayService:
    """
    Resilient telecom carrier SMS integration adapter.
    Supports Africa's Talking REST API (sandbox and production) with
    automatic local mock fallback, request timeouts, and idempotency guarantees.
    """
    def __init__(self, cache_size: int = 1000, ttl_seconds: float = 3600.0):
        self.cache_size = cache_size
        self.ttl_seconds = ttl_seconds
        # Inbound carrier message idempotency: message_id -> (incident_id, timestamp)
        self._inbound_idempotency: OrderedDict[str, tuple[str, float]] = OrderedDict()
        # Outbound notification idempotency: idempotency_key -> (response_dict, timestamp)
        self._outbound_idempotency: OrderedDict[str, tuple[Dict[str, Any], float]] = OrderedDict()
        self._lock = threading.RLock()

    def check_inbound_idempotency(self, message_id: str) -> Optional[str]:
        """Returns existing incident_id if message_id was previously ingested, else None."""
        if not message_id:
            return None
        with self._lock:
            if message_id in self._inbound_idempotency:
                incident_id, ts = self._inbound_idempotency[message_id]
                if time.time() - ts < self.ttl_seconds:
                    logger.info(f"Duplicate incoming SMS webhook ignored for carrier message_id: {message_id}")
                    return incident_id
                else:
                    del self._inbound_idempotency[message_id]
        return None

    def record_inbound_idempotency(self, message_id: str, incident_id: str):
        """Records an ingested message_id to prevent duplicate processing on retries."""
        if not message_id or not incident_id:
            return
        with self._lock:
            if len(self._inbound_idempotency) >= self.cache_size:
                self._inbound_idempotency.popitem(last=False)
            self._inbound_idempotency[message_id] = (incident_id, time.time())

    async def send_sms(
        self,
        to_phone: str,
        message_body: str,
        idempotency_key: Optional[str] = None,
        timeout_seconds: float = 6.0
    ) -> Dict[str, Any]:
        """
        Transmits an outbound SMS notification to civilian or field unit.
        Enforces idempotency, strict timeouts, and handles sandbox vs production credentials.
        """
        # Idempotency check for outbound alerts
        if idempotency_key:
            with self._lock:
                if idempotency_key in self._outbound_idempotency:
                    res, ts = self._outbound_idempotency[idempotency_key]
                    if time.time() - ts < self.ttl_seconds:
                        logger.info(f"Returning cached outbound SMS delivery for key: {idempotency_key}")
                        return res
                    else:
                        del self._outbound_idempotency[idempotency_key]

        masked_dest = mask_pii(to_phone)
        has_credentials = bool(settings.AFRICASTALKING_API_KEY and settings.AFRICASTALKING_USERNAME)

        # Production / Live API path via Africa's Talking
        if has_credentials and settings.ENVIRONMENT == "production":
            endpoint = (
                "https://api.africastalking.com/version1/messaging"
                if settings.AFRICASTALKING_USERNAME != "sandbox"
                else "https://api.sandbox.africastalking.com/version1/messaging"
            )
            headers = {
                "ApiKey": settings.AFRICASTALKING_API_KEY,
                "Accept": "application/json",
                "Content-Type": "application/x-www-form-urlencoded"
            }
            data = {
                "username": settings.AFRICASTALKING_USERNAME,
                "to": to_phone,
                "message": message_body,
                "from": settings.AFRICASTALKING_SENDER_ID
            }

            try:
                async with httpx.AsyncClient(timeout=timeout_seconds) as client:
                    resp = await client.post(endpoint, headers=headers, data=data)
                    resp.raise_for_status()
                    result = resp.json()

                response_payload = {
                    "status": "delivered",
                    "provider": "AfricasTalking",
                    "recipient": masked_dest,
                    "message_id": f"AT-MSG-{int(time.time()*1000)}",
                    "details": result
                }
            except httpx.TimeoutException:
                logger.error(f"Outbound SMS to {masked_dest} timed out after {timeout_seconds}s")
                raise TimeoutError(f"SMS carrier gateway timed out after {timeout_seconds}s")
            except Exception as e:
                logger.error(f"Outbound SMS transmission error to {masked_dest}: {e}")
                raise RuntimeError(f"SMS transmission failed: {str(e)}")
        else:
            # Resilient local tactical adapter (development / test / fallback)
            message_id = f"LOCAL-SIM-{int(time.time()*1000)}-{os.urandom(2).hex()}"
            response_payload = {
                "status": "delivered",
                "provider": "TacticalLocalGatewayMock",
                "recipient": masked_dest,
                "message_id": message_id,
                "text_preview": message_body[:45] + ("..." if len(message_body) > 45 else ""),
                "simulated": True
            }

        # Cache outbound result
        if idempotency_key:
            with self._lock:
                if len(self._outbound_idempotency) >= self.cache_size:
                    self._outbound_idempotency.popitem(last=False)
                self._outbound_idempotency[idempotency_key] = (response_payload, time.time())

        audit_service.log_event(
            action="SMS_NOTIFICATION_DISPATCHED",
            actor="System/TelecomGateway",
            details={
                "recipient": masked_dest,
                "provider": response_payload.get("provider"),
                "message_id": response_payload.get("message_id")
            }
        )

        return response_payload

sms_gateway = SMSGatewayService()


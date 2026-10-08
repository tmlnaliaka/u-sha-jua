import logging

import httpx

from config import settings

logger = logging.getLogger("sms_service")
AFRICASTALKING_URL = "https://api.africastalking.com/version1/messaging"


async def send_sms(phone_number: str, message: str) -> None:
    if not settings.AFRICASTALKING_API_KEY or not settings.AFRICASTALKING_USERNAME:
        raise RuntimeError("Africa's Talking SMS credentials are not configured.")

    payload = {
        "username": settings.AFRICASTALKING_USERNAME,
        "to": phone_number,
        "message": message,
    }
    if settings.AFRICASTALKING_SENDER_ID:
        payload["from"] = settings.AFRICASTALKING_SENDER_ID

    async with httpx.AsyncClient(timeout=8.0) as client:
        response = await client.post(
            AFRICASTALKING_URL,
            data=payload,
            headers={
                "apiKey": settings.AFRICASTALKING_API_KEY,
                "Accept": "application/json",
            },
        )
        response.raise_for_status()
        result = response.json()

    recipients = result.get("SMSMessageData", {}).get("Recipients", [])
    if not recipients or recipients[0].get("status") not in {"Success", "Sent", "Queued"}:
        logger.warning("Africa's Talking did not accept the SMS notification.")

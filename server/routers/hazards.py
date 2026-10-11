from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from models.user import User
from services.auth_dependencies import get_current_user
from services.hazard_alerts import get_hazard_alerts

router = APIRouter(prefix="/hazards", tags=["Public hazard alerts"])


class HazardAlert(BaseModel):
    id: str
    source: str
    headline: str
    event: str
    severity: str
    urgency: str
    certainty: str
    description: str
    instruction: str | None
    areas: list[str]
    coordinates: dict[str, float] | None
    issued_at: str | None
    effective_at: str | None
    expires_at: str | None
    source_url: str
    alert_level: str


class HazardSourceStatus(BaseModel):
    source: str
    status: Literal["ok", "stale", "degraded", "error"]
    fetched_at: str
    published_at: str | None
    url: str
    message: str


class HazardFeedResponse(BaseModel):
    alerts: list[HazardAlert]
    sources: list[HazardSourceStatus]
    fetched_at: str


@router.get("/alerts", response_model=HazardFeedResponse)
async def list_hazard_alerts(_: User = Depends(get_current_user)):
    """Return current, source-attributed public alerts for Kenya and East Africa."""
    return await get_hazard_alerts()

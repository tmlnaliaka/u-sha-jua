from typing import Dict, Any, Optional
from fastapi import APIRouter, Request, Query, status
from pydantic import BaseModel, Field
from services.telemetry import telemetry_collector

router = APIRouter(prefix="/telemetry", tags=["Observability & Telemetry"])


class ClientErrorReport(BaseModel):
    message: str = Field(..., description="Client runtime exception message")
    stack: Optional[str] = Field(default="", description="JavaScript error stack trace")
    componentStack: Optional[str] = Field(default="", description="React component tree stack")
    url: Optional[str] = Field(default="", description="Window location href at time of crash")
    userAgent: Optional[str] = Field(default="", description="Browser User-Agent header")
    timestamp: Optional[str] = Field(default=None, description="Client ISO-8601 timestamp")


@router.get("/metrics")
def get_telemetry_metrics() -> Dict[str, Any]:
    """
    Returns real-time operational observability metrics:
    - Request throughput, 4xx/5xx error counts, 429 rate-limit hits, client crash counts
    - Rolling latency percentiles (avg, p95, max in ms)
    - Subsystem health (spatial grid size, spatial LRU cache hits/misses, WebSocket connections, audit blocks)
    - Top 10 most queried API routes
    """
    return telemetry_collector.get_metrics()


@router.get("/logs")
def get_structured_logs(limit: int = Query(default=50, ge=1, le=100)) -> Dict[str, Any]:
    """
    Returns recent structured JSON request and error logs from the in-memory ring buffer.
    Each log includes correlation `request_id`, `method`, `path`, `status_code`, and `duration_ms`.
    """
    logs = telemetry_collector.get_recent_logs(limit=limit)
    return {
        "count": len(logs),
        "logs": logs
    }


@router.post("/client-error", status_code=status.HTTP_201_CREATED)
def report_client_error(payload: ClientErrorReport, request: Request) -> Dict[str, Any]:
    """
    Ingests a React ErrorBoundary crash snapshot from the browser, records a tamper-evident
    block in the SHA-256 cryptographic audit ledger, and appends to the structured error stream.
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        client_ip = forwarded.split(",")[0].strip()
    else:
        client_ip = request.client.host if request.client else "127.0.0.1"

    crash_entry = telemetry_collector.record_client_crash(payload.model_dump(), client_ip=client_ip)
    return {
        "status": "recorded",
        "crash": crash_entry
    }


@router.get("/client-errors")
def get_client_errors(limit: int = Query(default=25, ge=1, le=50)) -> Dict[str, Any]:
    """
    Returns recent client-side React ErrorBoundary crash snapshots reported to the backend.
    """
    crashes = telemetry_collector.get_client_crashes(limit=limit)
    return {
        "count": len(crashes),
        "crashes": crashes
    }


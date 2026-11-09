from contextlib import asynccontextmanager
import time
from sqlalchemy import text
from fastapi import FastAPI, Request, Response, HTTPException
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from config import settings
from database import Base, engine, SessionLocal, init_db
from models.incident import Incident, IncidentType, UrgencyLevel, IncidentStatus
from routers import (
    incidents_router,
    ws_router,
    sms_router,
    responders_router,
    weather_router,
    analytics_router,
    shelters_router,
    auth_router,
    telemetry_router,
    admin_db_router
)
from routers.responders import seed_responder_fleet
from routers.shelters import seed_shelters
from services.spatial_index import spatial_grid, spatial_cache
from services.websocket_manager import ws_manager
from services.audit_service import audit_service
from services.security import rate_limiter
from services.telemetry import telemetry_collector
import uuid
import os
from datetime import datetime, timezone
from fastapi.staticfiles import StaticFiles

def seed_initial_incidents():
    """Seeds rich initial crisis incidents across Kenyan informal & urban settlement hotspots."""
    db = SessionLocal()
    try:
        count = db.query(Incident).count()
        if count == 0:
            sample_incidents = [
                Incident(
                    id=str(uuid.uuid4()),
                    raw_text="Major flood water surging through Mathare 4A near Juja road bridge, 4 families trapped on rooftops, urgent rescue needed!",
                    incident_type=IncidentType.FLOOD,
                    urgency_level=UrgencyLevel.CRITICAL,
                    location_name="Mathare Valley 4A, Nairobi",
                    latitude=-1.2612,
                    longitude=36.8574,
                    status=IncidentStatus.PENDING,
                    timestamp=datetime.now(timezone.utc)
                ),
                Incident(
                    id=str(uuid.uuid4()),
                    raw_text="Fire outbreak at Gikomba timber yard spreading rapidly towards clothing stalls, thick smoke blocking exits.",
                    incident_type=IncidentType.FIRE,
                    urgency_level=UrgencyLevel.CRITICAL,
                    location_name="Gikomba Market, Nairobi",
                    latitude=-1.2850,
                    longitude=36.8375,
                    status=IncidentStatus.DISPATCHED,
                    timestamp=datetime.now(timezone.utc)
                ),
                Incident(
                    id=str(uuid.uuid4()),
                    raw_text="Perimeter wall collapsed after heavy downpour in Mukuru kwa Njenga, road completely blocked, 1 person injured.",
                    incident_type=IncidentType.COLLAPSE,
                    urgency_level=UrgencyLevel.MEDIUM,
                    location_name="Mukuru kwa Njenga, Nairobi",
                    latitude=-1.3197,
                    longitude=36.8770,
                    status=IncidentStatus.PENDING,
                    timestamp=datetime.now(timezone.utc)
                ),
                Incident(
                    id=str(uuid.uuid4()),
                    raw_text="Severe waterlogging and drainage blockage along Olympic junction Kibera, houses at risk of flash flooding.",
                    incident_type=IncidentType.FLOOD,
                    urgency_level=UrgencyLevel.MEDIUM,
                    location_name="Kibera Olympic, Nairobi",
                    latitude=-1.3133,
                    longitude=36.7869,
                    status=IncidentStatus.DISPATCHED,
                    timestamp=datetime.now(timezone.utc)
                ),
                Incident(
                    id=str(uuid.uuid4()),
                    raw_text="Electrical transformer spark in Eastleigh Section 3 causing localized small fire, power cut off.",
                    incident_type=IncidentType.FIRE,
                    urgency_level=UrgencyLevel.LOW,
                    location_name="Eastleigh Section 3, Nairobi",
                    latitude=-1.2764,
                    longitude=36.8524,
                    status=IncidentStatus.RESOLVED,
                    timestamp=datetime.now(timezone.utc)
                ),
                Incident(
                    id=str(uuid.uuid4()),
                    raw_text="Deep structural foundation cracks reported in 5-storey residential block in Pipeline near Stage Mpya.",
                    incident_type=IncidentType.COLLAPSE,
                    urgency_level=UrgencyLevel.CRITICAL,
                    location_name="Pipeline Estate, Embakasi, Nairobi",
                    latitude=-1.3150,
                    longitude=36.8994,
                    status=IncidentStatus.PENDING,
                    timestamp=datetime.now(timezone.utc)
                ),
            ]
            db.add_all(sample_incidents)
            db.commit()
    finally:
        db.close()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize DB tables & run migrations
    init_db()
    seed_initial_incidents()
    
    # Warm up in-memory spatial grid index from persistence layer & seed fleet & shelters
    db = SessionLocal()
    try:
        seed_responder_fleet(db)
        seed_shelters(db)
        active_incidents = db.query(Incident).all()
        for inc in active_incidents:
            spatial_grid.add_or_update(inc.to_dict())
    finally:
        db.close()
        
    yield

OPENAPI_TAGS = [
    {
        "name": "Authentication & RBAC",
        "description": "JWT Bearer token issuance, refresh rotation, user registration, and Role-Based Access Control (Dispatcher, Responder, Admin)."
    },
    {
        "name": "Incidents",
        "description": "Civilian distress ingestion (NLP + Swahili/Sheng gazetteer), GeoJSON spatial viewport feeds, OASIS CAP v1.2 alerts, hazard buffer perimeters, and offline mesh sync."
    },
    {
        "name": "Responders",
        "description": "First responder fleet tracking, Haversine ETA routing, Multi-Criteria Decision Analysis (MCDA) recommendations, and autonomous one-touch dispatch."
    },
    {
        "name": "Shelters",
        "description": "Evacuation shelter capacity tracking, nearest open shelter Haversine lookup, and live headcount updates."
    },
    {
        "name": "SMS Gateway",
        "description": "Africa's Talking & Twilio carrier webhook ingestion with HMAC/secret verification and idempotency deduplication."
    },
    {
        "name": "Weather",
        "description": "Meteorological radar telemetry, precipitation/river gauge monitoring, and Nairobi flood basin polygons."
    },
    {
        "name": "Analytics",
        "description": "Executive crisis KPIs (MTTD, MTTR, resolution rate), CSV dataset export, and SHA-256 tamper-evident cryptographic audit ledger verification."
    },
    {
        "name": "Observability & Telemetry",
        "description": "Real-time request throughput, latency percentiles (avg/p95/max), structured JSON correlation logs, and React ErrorBoundary crash ingestion."
    },
    {
        "name": "Database Migrations & Disaster Backup",
        "description": "Deterministic schema migrations (schema_migrations), composite B-Tree EXPLAIN QUERY PLAN inspection, portable SHA-256 snapshot export/restore, and deployment hardening audits."
    },
    {
        "name": "Health",
        "description": "Deep system health (/health), Kubernetes/Docker liveness (/healthz), and database readiness (/readyz) probes."
    },
    {
        "name": "Diagnostics",
        "description": "Synthetic fault injection endpoints for verifying resilient error envelopes and traceback masking."
    }
]

app = FastAPI(
    title="u-SHA-jua Disaster Informatics Platform",
    description=(
        "Resilient Asynchronous Geospatial Disaster Intelligence & Emergency Dispatch System "
        "for East African Informal Settlements & Crisis Corridors."
    ),
    version="1.4.0-enterprise",
    openapi_tags=OPENAPI_TAGS,
    contact={
        "name": "u-SHA-jua Sovereign Crisis Engineering Team",
        "url": "https://github.com/tmlnaliaka/u-sha-jua"
    },
    license_info={
        "name": "Apache 2.0",
        "url": "https://www.apache.org/licenses/LICENSE-2.0.html"
    },
    lifespan=lifespan
)

# Compression middleware for low-bandwidth cellular environments
app.add_middleware(GZipMiddleware, minimum_size=500)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=[
        "X-Process-Time",
        "X-Request-ID",
        "X-RateLimit-Limit",
        "X-RateLimit-Remaining",
        "X-RateLimit-Reset",
        "Retry-After",
        "Content-Security-Policy",
        "X-Frame-Options",
        "X-Content-Type-Options",
        "Referrer-Policy",
        "Permissions-Policy",
        "Cache-Control"
    ]
)

# OWASP Security Headers & Request Correlation Middleware
@app.middleware("http")
async def security_headers_and_correlation_middleware(request: Request, call_next):
    start_time = time.time()
    request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    request.state.request_id = request_id
    
    # 1. Rate Limiting Sliding-Window Check
    path = request.url.path
    method = request.method
    
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        client_ip = forwarded.split(",")[0].strip()
    else:
        client_ip = request.client.host if request.client else "127.0.0.1"

    # Whitelist / admin / internal bypass
    bypass_key = request.headers.get("x-skip-rate-limit")
    is_whitelisted = bypass_key and bypass_key in [settings.ADMIN_API_KEY, "ushajua-dev-admin-key", "test-bypass"]

    rate_limit_info = None
    if not is_whitelisted and not path.startswith("/health") and not path.startswith("/readyz") and not path.startswith("/healthz"):
        if method == "POST" and ("/auth/token" in path or "/auth/login" in path or "/auth/register" in path):
            tier = "auth"
            max_req, win_sec = 10, 60.0
        elif method == "POST" and "/sms/incoming" in path:
            tier = "sms_webhook"
            max_req, win_sec = 30, 60.0
        elif method == "POST" and ("/incidents" in path):
            tier = "incident_creation"
            max_req, win_sec = 30, 60.0
        else:
            tier = "general"
            max_req, win_sec = 300, 60.0

        client_key = f"{tier}:{client_ip}"
        allowed, remaining, retry_after = rate_limiter.is_allowed(client_key, max_requests=max_req, window_seconds=win_sec)
        reset_time = int(time.time() + (retry_after if not allowed else win_sec))
        rate_limit_info = {
            "limit": max_req,
            "remaining": remaining,
            "reset": reset_time,
            "retry_after": retry_after
        }

        if not allowed:
            process_time = time.time() - start_time
            telemetry_collector.record_request(method, path, 429, process_time * 1000, request_id, client_ip)
            origin = request.headers.get("origin")
            resp_headers = {
                "Retry-After": str(int(retry_after)),
                "X-RateLimit-Limit": str(max_req),
                "X-RateLimit-Remaining": "0",
                "X-RateLimit-Reset": str(reset_time),
                "X-Request-ID": request_id,
                "Access-Control-Allow-Origin": origin or "*",
                "Access-Control-Allow-Credentials": "true",
                "Access-Control-Expose-Headers": "Retry-After, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, X-Request-ID"
            }
            return JSONResponse(
                status_code=429,
                content={
                    "detail": f"Rate limit exceeded. Maximum {max_req} requests per {int(win_sec)}s. Please retry in {retry_after}s.",
                    "error": "RATE_LIMIT_EXCEEDED",
                    "retry_after": retry_after
                },
                headers=resp_headers
            )

    response: Response = await call_next(request)
    
    process_time = time.time() - start_time
    telemetry_collector.record_request(method, path, response.status_code, process_time * 1000, request_id, client_ip)
    response.headers["X-Process-Time"] = f"{process_time:.4f}s"
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(self), microphone=(self), camera=(self)"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:*; "
        "img-src 'self' data: blob: https: *.tile.openstreetmap.org https://*.tile.openstreetmap.org; "
        "connect-src 'self' ws: wss: http: https: ws://127.0.0.1:* ws://localhost:*; "
        "frame-ancestors 'none'; "
        "base-uri 'self'; "
        "object-src 'none';"
    )

    if rate_limit_info:
        response.headers["X-RateLimit-Limit"] = str(rate_limit_info["limit"])
        response.headers["X-RateLimit-Remaining"] = str(rate_limit_info["remaining"])
        response.headers["X-RateLimit-Reset"] = str(rate_limit_info["reset"])

    # High-Performance HTTP Cache-Control Strategy for Disaster Telecom Optimization
    path = request.url.path
    if request.method == "GET" and response.status_code == 200:
        if path.startswith("/static/") or path.startswith("/assets/"):
            response.headers["Cache-Control"] = "public, max-age=86400, immutable"
        elif "/weather/telemetry" in path or "/weather/flood-zones" in path:
            response.headers["Cache-Control"] = "public, max-age=15, stale-while-revalidate=30"
        elif "/analytics/" in path or "/shelters" in path:
            response.headers["Cache-Control"] = "public, max-age=10, must-revalidate"
        elif "/incidents" in path:
            response.headers["Cache-Control"] = "private, no-cache, must-revalidate"

    return response

# Mount API Routers
app.include_router(auth_router, prefix=settings.API_V1_PREFIX)
app.include_router(incidents_router, prefix=settings.API_V1_PREFIX)
app.include_router(sms_router, prefix=settings.API_V1_PREFIX)
app.include_router(responders_router, prefix=settings.API_V1_PREFIX)
app.include_router(weather_router, prefix=settings.API_V1_PREFIX)
app.include_router(analytics_router, prefix=settings.API_V1_PREFIX)
app.include_router(shelters_router, prefix=settings.API_V1_PREFIX)
app.include_router(telemetry_router, prefix=settings.API_V1_PREFIX)
app.include_router(admin_db_router, prefix=settings.API_V1_PREFIX)
app.include_router(ws_router)

# Mount Static Uploads Directory for disaster photos and audio distress notes
UPLOADS_DIR = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOADS_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")


SERVER_START_TIME = time.time()

@app.get("/health", tags=["Health"])
def health_check():
    integrity = audit_service.verify_integrity()
    db_connected = False
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
            db_connected = True
    except Exception:
        db_connected = False

    uptime_seconds = round(time.time() - SERVER_START_TIME, 2)
    return {
        "status": "healthy" if db_connected else "degraded",
        "service": "u-SHA-jua Sovereign Backend API",
        "version": "1.4.0-enterprise",
        "uptime_seconds": uptime_seconds,
        "database": {
            "dialect": engine.dialect.name,
            "connected": db_connected
        },
        "security_mode": "strict" if settings.ENFORCE_STRICT_AUTH else "development_authenticated",
        "audit_ledger_blocks": integrity.get("total_blocks", 0),
        "audit_chain_verified": integrity.get("valid", False),
        "spatial_grid_items": spatial_grid.size(),
        "active_ws_connections": ws_manager.active_count,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

@app.get("/healthz", tags=["Health"])
def liveness_probe():
    """Kubernetes / Docker liveness probe."""
    return {"status": "alive"}

@app.get("/readyz", tags=["Health"])
def readiness_probe():
    """Kubernetes / Docker readiness probe checking DB connectivity."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "ready"}
    except Exception:
        raise HTTPException(status_code=503, detail="Database connection unavailable")

# Structured Error Envelope Helper
def build_error_envelope(
    status_code: int,
    error_code: str,
    message: str,
    request: Request,
    details: any = None
) -> dict:
    request_id = getattr(request.state, "request_id", None) or request.headers.get("X-Request-ID") or str(uuid.uuid4())
    envelope = {
        "success": False,
        "error_code": error_code,
        "message": message,
        "detail": message,  # Backward compatibility with default FastAPI client expectations
        "status_code": status_code,
        "request_id": request_id,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    if details is not None:
        envelope["details"] = details
    return envelope

@app.exception_handler(StarletteHTTPException)
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    request_id = getattr(request.state, "request_id", None) or request.headers.get("X-Request-ID") or str(uuid.uuid4())
    error_code = f"HTTP_{exc.status_code}"
    if exc.status_code == 404:
        error_code = "NOT_FOUND"
    elif exc.status_code == 401:
        error_code = "UNAUTHORIZED"
    elif exc.status_code == 403:
        error_code = "FORBIDDEN"
    elif exc.status_code == 429:
        error_code = "RATE_LIMIT_EXCEEDED"

    content = build_error_envelope(
        status_code=exc.status_code,
        error_code=error_code,
        message=str(exc.detail),
        request=request
    )
    headers = {
        "X-Request-ID": request_id,
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY"
    }
    if hasattr(exc, "headers") and exc.headers:
        headers.update(exc.headers)

    return JSONResponse(status_code=exc.status_code, content=content, headers=headers)

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    request_id = getattr(request.state, "request_id", None) or request.headers.get("X-Request-ID") or str(uuid.uuid4())
    clean_errors = []
    for err in exc.errors():
        clean_errors.append({
            "field": ".".join(str(loc) for loc in err.get("loc", [])),
            "message": err.get("msg", "Invalid field input"),
            "type": err.get("type", "value_error")
        })

    content = build_error_envelope(
        status_code=422,
        error_code="VALIDATION_ERROR",
        message="Request payload validation failed on one or more fields.",
        request=request,
        details=clean_errors
    )
    # Also expose standard detail array so existing test clients expecting list of errors pass seamlessly
    content["detail"] = exc.errors()

    return JSONResponse(
        status_code=422,
        content=content,
        headers={"X-Request-ID": request_id, "X-Content-Type-Options": "nosniff"}
    )

@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    request_id = getattr(request.state, "request_id", None) or request.headers.get("X-Request-ID") or str(uuid.uuid4())
    import logging
    logging.getLogger("uvicorn.error").error(
        f"Unhandled Server Error [ReqID: {request_id}] on {request.method} {request.url.path}: {exc}",
        exc_info=True
    )

    # Return safe masked error envelope to client without leaking internal python stack trace or DB strings
    content = build_error_envelope(
        status_code=500,
        error_code="INTERNAL_SERVER_ERROR",
        message="An unexpected server error occurred. Emergency telemetry request has been logged.",
        request=request
    )
    origin = request.headers.get("origin") or "*"
    return JSONResponse(
        status_code=500,
        content=content,
        headers={
            "X-Request-ID": request_id,
            "X-Content-Type-Options": "nosniff",
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Credentials": "true"
        }
    )

@app.get("/api/v1/test/synthetic-error", tags=["Diagnostics"])
def trigger_synthetic_error():
    """Diagnostic route to verify that unhandled 500 exceptions suppress tracebacks and return structured error envelopes."""
    raise RuntimeError("Synthetic crisis hardware simulation fault - DB socket connection dropped unexpectedly!")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=settings.HOST, port=settings.PORT, reload=True)

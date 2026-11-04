from contextlib import asynccontextmanager
import time
from sqlalchemy import text
from fastapi import FastAPI, Request, Response, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from config import settings
from database import Base, engine, SessionLocal
from models.incident import Incident, IncidentType, UrgencyLevel, IncidentStatus
from routers import (
    incidents_router,
    ws_router,
    sms_router,
    responders_router,
    weather_router,
    analytics_router,
    shelters_router
)
from routers.responders import seed_responder_fleet
from routers.shelters import seed_shelters
from services.spatial_index import spatial_grid, spatial_cache
from services.websocket_manager import ws_manager
from services.audit_service import audit_service
import uuid
from datetime import datetime, timezone

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
    # Initialize DB tables
    Base.metadata.create_all(bind=engine)
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

app = FastAPI(
    title="u-SHA-jua Disaster Informatics Platform",
    description="Resilient Asynchronous Geospatial Disaster Intelligence & Emergency Dispatch System",
    version="1.3.0-enterprise",
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
)

# OWASP Security Headers & Request Correlation Middleware
@app.middleware("http")
async def security_headers_and_correlation_middleware(request: Request, call_next):
    start_time = time.time()
    request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    
    response: Response = await call_next(request)
    
    process_time = time.time() - start_time
    response.headers["X-Process-Time"] = f"{process_time:.4f}s"
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(self), microphone=(), camera=()"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self' 'unsafe-inline' https:; "
        "img-src 'self' data: https: *.tile.openstreetmap.org; "
        "connect-src 'self' ws: wss: http: https:;"
    )
    return response

# Mount API Routers
app.include_router(incidents_router, prefix=settings.API_V1_PREFIX)
app.include_router(sms_router, prefix=settings.API_V1_PREFIX)
app.include_router(responders_router, prefix=settings.API_V1_PREFIX)
app.include_router(weather_router, prefix=settings.API_V1_PREFIX)
app.include_router(analytics_router, prefix=settings.API_V1_PREFIX)
app.include_router(shelters_router, prefix=settings.API_V1_PREFIX)
app.include_router(ws_router)


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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=settings.HOST, port=settings.PORT, reload=True)

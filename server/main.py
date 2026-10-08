from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from config import settings
from database import Base, engine, SessionLocal
from models.incident import Incident, IncidentType, UrgencyLevel, IncidentStatus
from routers import incidents_router, ws_router
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
    yield

app = FastAPI(
    title="u-SHA-jua Disaster Informatics Platform",
    description="Resilient Asynchronous Geospatial Disaster Intelligence & Emergency Dispatch System",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API Routers
app.include_router(incidents_router, prefix=settings.API_V1_PREFIX)
app.include_router(ws_router)

@app.get("/health", tags=["Health"])
def health_check():
    return {
        "status": "healthy",
        "service": "u-SHA-jua Backend API",
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=settings.HOST, port=settings.PORT, reload=True)

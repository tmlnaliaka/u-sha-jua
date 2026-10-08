import pytest
import os
import sys
from fastapi.testclient import TestClient

# Ensure server path is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from main import app
from database import Base, engine, SessionLocal
from models.incident import Incident, IncidentType, UrgencyLevel, IncidentStatus

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    # Clean up can be done if needed

def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"

def test_civilian_report_nlp_extraction():
    # Distress report without GPS coordinates -> NLP should geocode Mathare
    payload = {
        "raw_text": "Flooding in Mathare 4A near river, 3 people trapped in water!",
        "sender_phone": "+254712345678"
    }
    response = client.post("/api/v1/incidents/report", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["incident_type"] == "Flood"
    assert data["urgency_level"] == "Critical"
    assert "Mathare" in data["location_name"]
    assert -1.3 < data["coordinates"]["latitude"] < -1.2
    assert 36.8 < data["coordinates"]["longitude"] < 36.9
    assert data["status"] == "Pending"

def test_civilian_report_with_device_gps():
    payload = {
        "raw_text": "Small smoke observed at warehouse",
        "device_lat": -1.3000,
        "device_lon": 36.8000
    }
    response = client.post("/api/v1/incidents/report", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["incident_type"] == "Fire"
    assert data["urgency_level"] == "Low"
    assert data["coordinates"]["latitude"] == -1.3000
    assert data["coordinates"]["longitude"] == 36.8000

def test_invalid_coordinates_validation():
    # Latitude > 90 must fail validation
    payload = {
        "raw_text": "Illegal coords test",
        "incident_type": "Flood",
        "urgency_level": "Medium",
        "location_name": "Test Location",
        "coordinates": {
            "latitude": 999.0,
            "longitude": 36.82
        }
    }
    response = client.post("/api/v1/incidents", json=payload)
    assert response.status_code == 422

def test_spatial_feed_geojson_format():
    response = client.get("/api/v1/incidents/spatial-feed")
    assert response.status_code == 200
    geojson = response.json()
    assert geojson["type"] == "FeatureCollection"
    assert isinstance(geojson["features"], list)
    if geojson["features"]:
        feature = geojson["features"][0]
        assert feature["type"] == "Feature"
        assert "geometry" in feature
        assert feature["geometry"]["type"] == "Point"
        assert len(feature["geometry"]["coordinates"]) == 2 # [lon, lat]
        assert "properties" in feature
        assert "urgency_level" in feature["properties"]

def test_update_incident_status():
    # Create incident first
    payload = {
        "raw_text": "Fire in Gikomba market stalls",
        "device_lat": -1.2850,
        "device_lon": 36.8375
    }
    create_res = client.post("/api/v1/incidents/report", json=payload)
    incident_id = create_res.json()["id"]

    # Dispatch response unit
    patch_res = client.patch(f"/api/v1/incidents/{incident_id}/status", json={"status": "Dispatched"})
    assert patch_res.status_code == 200
    assert patch_res.json()["status"] == "Dispatched"

    # Resolve incident
    resolve_res = client.patch(f"/api/v1/incidents/{incident_id}/status", json={"status": "Resolved"})
    assert resolve_res.status_code == 200
    assert resolve_res.json()["status"] == "Resolved"

import pytest
import os
import sys
import time
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from main import app
from database import Base, engine
from services.spatial_index import spatial_grid, spatial_cache
from services.nlp_service import nlp_service
from services.websocket_manager import ws_manager

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield

def test_spatial_grid_index_query():
    """Validates that the in-memory spatial grid index indexes and queries correctly."""
    # Seed a known incident into the spatial grid
    test_inc = {
        "id": "test-grid-id-1",
        "raw_text": "Flooding along Mathare river bank",
        "incident_type": "Flood",
        "urgency_level": "Critical",
        "location_name": "Mathare Valley 4A",
        "coordinates": {"latitude": -1.2612, "longitude": 36.8574},
        "status": "Pending",
        "timestamp": "2026-10-11T12:00:00Z"
    }
    spatial_grid.add_or_update(test_inc)
    assert spatial_grid.size() >= 1

    # Query bounding box containing Mathare
    results = spatial_grid.query_viewport(
        min_lat=-1.30, max_lat=-1.20,
        min_lon=36.80, max_lon=36.90
    )
    assert any(r["id"] == "test-grid-id-1" for r in results)

    # Query distant bounding box (e.g. Mombasa Old Town) - should not contain Mathare
    mombasa_results = spatial_grid.query_viewport(
        min_lat=-4.10, max_lat=-4.00,
        min_lon=39.60, max_lon=39.75
    )
    assert not any(r["id"] == "test-grid-id-1" for r in mombasa_results)

def test_spatial_lru_cache_and_invalidation():
    """Validates viewport caching and cache invalidation on new incident insertion."""
    # Clear cache
    spatial_cache.invalidate_all()
    initial_misses = spatial_cache.misses

    # First request: Cache Miss
    res1 = client.get("/api/v1/incidents/spatial-feed?min_lat=-1.30&max_lat=-1.20&min_lon=36.80&max_lon=36.90")
    assert res1.status_code == 200

    # Second request with identical/clustered coordinates: Cache Hit
    res2 = client.get("/api/v1/incidents/spatial-feed?min_lat=-1.30&max_lat=-1.20&min_lon=36.80&max_lon=36.90")
    assert res2.status_code == 200
    assert spatial_cache.hits >= 1

    # Creating a new incident must invalidate the viewport cache
    client.post("/api/v1/incidents/report", json={"raw_text": "Small smoke in Eastleigh Section 3"})
    assert len(spatial_cache._cache) == 0  # Purged

def test_nlp_extraction_caching():
    """Validates that repeated civilian distress phrasing returns from in-memory NLP cache."""
    msg = "Flash flood surge in Mathare 4A near river bridge"
    res1 = client.post("/api/v1/incidents/report", json={"raw_text": msg})
    assert res1.status_code == 201

    cached_item = nlp_service.cache.get(msg, None, None)
    assert cached_item is not None
    assert cached_item.incident_type.value == "Flood"
    assert cached_item.urgency_level.value == "Critical"

def test_telecom_sms_webhook():
    """Validates high-availability Africa's Talking incoming SMS gateway webhook."""
    # Form-urlencoded payload typical of Africa's Talking carrier webhooks
    form_data = {
        "from": "+254719123456",
        "to": "22141",
        "text": "Fire breaking out at Gikomba timber market near bridge",
        "date": "2026-10-11 12:00:00",
        "id": "ATXid_987654321"
    }
    response = client.post("/api/v1/sms/incoming", data=form_data)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert data["urgency"] in ["Critical", "Medium", "Low"]
    assert "Gikomba" in data["geocoded_location"]

    # Test signature rejection when secret is set
    from config import settings
    orig_secret = settings.SMS_WEBHOOK_SECRET
    try:
        settings.SMS_WEBHOOK_SECRET = "carrier-super-secret-key"
        # 1. Missing or invalid secret -> 401
        res_bad = client.post("/api/v1/sms/incoming", data=form_data, headers={"X-Webhook-Secret": "wrong"})
        assert res_bad.status_code == 401

        # 2. Valid secret header -> 200
        res_good = client.post("/api/v1/sms/incoming", data=form_data, headers={"X-Webhook-Secret": "carrier-super-secret-key"})
        assert res_good.status_code == 200
    finally:
        settings.SMS_WEBHOOK_SECRET = orig_secret

def test_batch_incident_reporting():
    """Validates atomic batch ingestion for high-concurrency SMS relays."""
    batch_payload = {
        "reports": [
            {"raw_text": "Flooding in Budalangi rescue boats needed"},
            {"raw_text": "Building wall collapse in Mukuru kwa Njenga road blocked"},
            {"raw_text": "Transformer spark Eastleigh power down"}
        ]
    }
    response = client.post("/api/v1/incidents/batch-report", json=batch_payload)
    assert response.status_code == 201
    data = response.json()
    assert data["total_processed"] == 3
    assert data["successful"] == 3
    assert len(data["incidents"]) == 3

def test_pagination_and_x_total_count():
    """Validates pagination limits and X-Total-Count header."""
    response = client.get("/api/v1/incidents?limit=2&offset=0")
    assert response.status_code == 200
    assert len(response.json()) <= 2
    assert "X-Total-Count" in response.headers
    assert int(response.headers["X-Total-Count"]) >= 2

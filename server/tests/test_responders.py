import pytest
import os
import sys
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from main import app
from database import Base, engine

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield

def test_get_responder_fleet():
    """Validates that emergency responder fleet seeds and lists properly."""
    response = client.get("/api/v1/responders")
    assert response.status_code == 200
    units = response.json()
    assert len(units) >= 6
    callsigns = [u["callsign"].upper() for u in units]
    assert any("RED CROSS" in c for c in callsigns)
    assert any("FIRE" in c for c in callsigns)


def test_responder_proximity_calculation():
    """Validates distance and ETA calculation to an incident."""
    inc_res = client.get("/api/v1/incidents")
    assert inc_res.status_code == 200
    incidents = inc_res.json()
    assert len(incidents) > 0
    target_id = incidents[0]["id"]

    resp_res = client.get(f"/api/v1/responders?incident_id={target_id}")
    assert resp_res.status_code == 200
    units = resp_res.json()
    assert units[0]["distance_km"] is not None
    assert units[0]["eta_minutes"] is not None
    assert units[0]["eta_minutes"] >= 3

def test_dispatch_responder_workflow():
    """Validates unit assignment, status transition, and synchronized incident dispatch."""
    inc_res = client.get("/api/v1/incidents?status=Pending")
    incidents = inc_res.json()
    if not incidents:
        # Create one if none pending
        rep = client.post("/api/v1/incidents/report", json={"raw_text": "Flooding Mathare 4A near river"})
        target_id = rep.json()["id"]
    else:
        target_id = incidents[0]["id"]

    units = client.get("/api/v1/responders").json()
    available_units = [u for u in units if u["status"] == "Available"]
    assert len(available_units) > 0
    unit_id = available_units[0]["id"]

    dispatch_res = client.post(f"/api/v1/responders/{unit_id}/dispatch", json={"incident_id": target_id})
    assert dispatch_res.status_code == 200
    data = dispatch_res.json()
    assert data["status"] == "Dispatched"
    assert data["assigned_incident_id"] == target_id

    # Verify incident status updated to Dispatched
    inc_check = client.get(f"/api/v1/incidents/{target_id}")
    assert inc_check.json()["status"] == "Dispatched"

def test_crisis_surge_simulation():
    """Validates stress-test simulation injection."""
    surge_res = client.post("/api/v1/responders/surge-simulate", json={"surge_count": 2})
    assert surge_res.status_code == 200
    data = surge_res.json()
    assert data["status"] == "surge_simulated"
    assert data["injected_count"] == 2
    assert len(data["incidents"]) == 2

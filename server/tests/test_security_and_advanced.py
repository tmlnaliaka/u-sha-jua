import pytest
from fastapi.testclient import TestClient
from main import app
from database import Base, engine, SessionLocal
from models.incident import Incident, IncidentType, UrgencyLevel, IncidentStatus
from models.responder import ResponderUnit, ResponderType, ResponderStatus
from models.shelter import Shelter
from services.security import mask_pii, sanitize_input, InMemoryRateLimiter
from services.audit_service import audit_service, AuditService
from routers.responders import seed_responder_fleet
from routers.shelters import seed_shelters

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    seed_responder_fleet(db)
    seed_shelters(db)
    yield
    db.close()

def test_pii_masking_utility():
    text1 = "Trapped in Mathare! Call my brother at +254 712 345 678 immediately!"
    masked1 = mask_pii(text1)
    assert "+254 712 *** *78" in masked1
    assert "345 678" not in masked1

    text2 = "Contact 0722123456 for evacuation assistance"
    masked2 = mask_pii(text2)
    assert "0 722 *** *56" in masked2 or "***" in masked2

def test_input_sanitization_defense():
    dirty = "<script>alert('xss')</script>Trapped near flood wall<script src='evil.js'></script>"
    clean = sanitize_input(dirty)
    assert "<script>" not in clean
    assert "alert" not in clean
    assert "Trapped near flood wall" in clean

    # Test length bounding
    huge_text = "A" * 6000
    bounded = sanitize_input(huge_text, max_len=4000)
    assert len(bounded) == 4000

def test_in_memory_rate_limiter():
    limiter = InMemoryRateLimiter()
    client_ip = "192.168.1.99"

    # Allow up to 3 requests in 10-second window
    for _ in range(3):
        allowed, remaining, retry_after = limiter.is_allowed(client_ip, max_requests=3, window_seconds=10.0)
        assert allowed is True

    # 4th request must be blocked
    allowed, remaining, retry_after = limiter.is_allowed(client_ip, max_requests=3, window_seconds=10.0)
    assert allowed is False
    assert retry_after > 0

def test_cryptographic_audit_ledger_integrity():
    ledger = AuditService()
    # Log several actions
    e1 = ledger.log_event("TEST_ACTION_1", "Actor/Test", {"param": 100})
    e2 = ledger.log_event("TEST_ACTION_2", "Actor/Test", {"param": 200})

    assert e1.entry_id == 1
    assert e2.entry_id == 2
    assert e2.previous_hash == e1.entry_hash

    # Verify chain
    ver = ledger.verify_integrity()
    assert ver["valid"] is True
    assert ver["total_blocks"] == 3

    # Tamper with block 1 details and verify detection
    ledger._entries[1].details = {"param": 9999}
    tampered_ver = ledger.verify_integrity()
    assert tampered_ver["valid"] is False
    assert tampered_ver["error_at_block"] == 1

def test_evacuation_shelters_api():
    res = client.get("/api/v1/shelters")
    assert res.status_code == 200
    data = res.json()
    assert len(data) >= 5
    assert any("Mathare" in s["name"] for s in data)

    # Test nearest shelter query near Mathare
    res_nearest = client.get("/api/v1/shelters/nearest?latitude=-1.2600&longitude=36.8580")
    assert res_nearest.status_code == 200
    nearest = res_nearest.json()
    assert "Mathare" in nearest["name"]
    assert "distance_km" in nearest
    assert nearest["available_space"] > 0

    # Test shelter occupancy update with auth
    shelter_id = data[0]["id"]
    res_update = client.patch(
        f"/api/v1/shelters/{shelter_id}/occupancy",
        json={"occupancy_current": 350},
        headers={"X-API-Key": "ushajua-dev-dispatcher-key"}
    )
    assert res_update.status_code == 200
    assert res_update.json()["occupancy_current"] == 350

def test_responder_recommendation_and_auto_dispatch():
    # 1. Create a test Flood incident in Mathare
    inc_res = client.post(
        "/api/v1/incidents/report",
        json={
            "raw_text": "Flooding trap in Mathare 4A near river bank!",
            "device_lat": -1.2612,
            "device_lon": 36.8574
        }
    )
    assert inc_res.status_code == 201
    inc_id = inc_res.json()["id"]

    # 2. Query MCDA recommendation
    rec_res = client.get(f"/api/v1/responders/recommend/{inc_id}")
    assert rec_res.status_code == 200
    rec = rec_res.json()
    assert rec["incident_id"] == inc_id
    assert rec["best_match"] is not None
    assert rec["best_match"]["match_score"] > 50.0
    # For Flood, WaterRescue or SearchRescue should score high
    assert rec["best_match"]["unit_type"] in ["WaterRescue", "SearchRescue", "Ambulance"]

    # 3. Execute Auto-Dispatch
    auto_res = client.post(
        f"/api/v1/responders/auto-dispatch/{inc_id}",
        headers={"X-API-Key": "ushajua-dev-dispatcher-key"}
    )
    assert auto_res.status_code == 200
    dispatched_unit = auto_res.json()
    assert dispatched_unit["assigned_incident_id"] == inc_id
    assert dispatched_unit["status"] == "Dispatched"

def test_dynamic_hazard_perimeter():
    # Create critical fire incident in Gikomba
    inc_res = client.post(
        "/api/v1/incidents/report",
        json={
            "raw_text": "Massive fire at Gikomba timber market spreading to 10 stalls!",
            "device_lat": -1.2850,
            "device_lon": 36.8375
        }
    )
    assert inc_res.status_code == 201
    inc_id = inc_res.json()["id"]

    perim_res = client.get(f"/api/v1/incidents/{inc_id}/hazard-perimeter")
    assert perim_res.status_code == 200
    feature = perim_res.json()
    assert feature["type"] == "Feature"
    assert feature["geometry"]["type"] == "Polygon"
    assert len(feature["geometry"]["coordinates"][0]) >= 16
    assert feature["properties"]["radius_meters"] > 0
    assert feature["properties"]["estimated_population_impacted"] > 0
    assert "evacuation_advisory" in feature["properties"]
    assert feature["properties"]["nearest_evacuation_shelter"] is not None

def test_offline_mesh_packet_sync_and_export():
    # Test exporting offline bundle
    exp_res = client.get("/api/v1/incidents/export/offline-bundle")
    assert exp_res.status_code == 200
    bundle = exp_res.json()
    assert "active_incidents" in bundle
    assert "shelters" in bundle
    assert "security_checksum" in bundle

    # Test ingesting an offline mesh packet
    import uuid
    test_mesh_id = f"mesh-inc-{uuid.uuid4()}"
    sync_payload = {
        "device_id": "LORA_NODE_BUSIA_04",
        "packet_timestamp": "2026-10-15T09:00:00Z",
        "incidents": [
            {
                "id": test_mesh_id,
                "raw_text": "Dyke breached at Budalangi bridge, 12 homes submerged",
                "incident_type": "Flood",
                "urgency_level": "Critical",
                "location_name": "Budalangi Flood Basin, Busia",
                "latitude": 0.1342,
                "longitude": 34.0203
            }
        ]
    }
    sync_res = client.post("/api/v1/incidents/sync/offline-packet", json=sync_payload)
    assert sync_res.status_code == 200
    res_data = sync_res.json()
    assert res_data["status"] == "synchronized"
    assert res_data["newly_ingested"] >= 1

    # Verify it can be retrieved from incident feed
    get_res = client.get(f"/api/v1/incidents/{test_mesh_id}")
    assert get_res.status_code == 200
    assert get_res.json()["location_name"] == "Budalangi Flood Basin, Busia"

def test_audit_log_endpoint():
    res = client.get("/api/v1/analytics/audit-log")
    assert res.status_code == 200
    assert len(res.json()["entries"]) > 0

    ver_res = client.get("/api/v1/analytics/audit-log/verify")
    assert ver_res.status_code == 200
    assert ver_res.json()["valid"] is True

import hmac
import hashlib
import time
import pytest
from fastapi.testclient import TestClient
from main import app
from config import settings
from models.incident import Incident
from database import SessionLocal

client = TestClient(app)

@pytest.fixture
def auth_headers():
    return {"X-API-Key": settings.DISPATCHER_API_KEY}

def test_api_contract_incidents_schema_and_headers(auth_headers):
    """Verifies GET /api/v1/incidents contract: field names, types, and pagination headers."""
    response = client.get("/api/v1/incidents?limit=5&offset=0", headers=auth_headers)
    assert response.status_code == 200
    assert "X-Total-Count" in response.headers
    data = response.json()
    assert isinstance(data, list)
    if len(data) > 0:
        sample = data[0]
        assert "id" in sample
        assert "raw_text" in sample
        assert "incident_type" in sample
        assert "urgency_level" in sample
        assert "location_name" in sample
        assert "coordinates" in sample
        assert "latitude" in sample["coordinates"]
        assert "longitude" in sample["coordinates"]
        assert "status" in sample
        assert "timestamp" in sample

def test_api_contract_filtering_and_sorting(auth_headers):
    """Verifies search, sort, and filter contracts on GET /api/v1/incidents."""
    # Test text search ?q=
    res_search = client.get("/api/v1/incidents?q=Mathare", headers=auth_headers)
    assert res_search.status_code == 200
    items = res_search.json()
    for item in items:
        assert "mathare" in item["location_name"].lower() or "mathare" in item["raw_text"].lower()

    # Test sorting ?sort_by=timestamp&order=asc
    res_sort = client.get("/api/v1/incidents?sort_by=timestamp&order=asc&limit=10", headers=auth_headers)
    assert res_sort.status_code == 200
    sorted_items = res_sort.json()
    if len(sorted_items) >= 2:
        assert sorted_items[0]["timestamp"] <= sorted_items[-1]["timestamp"]

def test_validation_error_shape_contract():
    """Verifies that 422 Unprocessable Entity returns standard Pydantic error shape."""
    # Send invalid coordinates and missing required raw_text
    response = client.post(
        "/api/v1/incidents/report",
        json={"raw_text": "", "device_lat": 999.0, "device_lon": -999.0}
    )
    assert response.status_code == 422
    err_body = response.json()
    assert "detail" in err_body
    assert isinstance(err_body["detail"], list)
    assert len(err_body["detail"]) > 0
    # Every error must have loc and msg
    first_err = err_body["detail"][0]
    assert "loc" in first_err
    assert "msg" in first_err

def test_weather_and_radar_contract():
    """Verifies meteorological early warning telemetry and GeoJSON polygon contracts."""
    telemetry_res = client.get("/api/v1/weather/telemetry")
    assert telemetry_res.status_code == 200
    t_data = telemetry_res.json()
    assert "status" in t_data
    assert "provider" in t_data
    assert "circuit_breaker" in t_data
    assert "precipitation_rate_mmh" in t_data
    assert "river_gauge_elevation_m" in t_data
    assert "warning_bulletin" in t_data
    assert t_data["circuit_breaker"] == "healthy"

    # GeoJSON polygons
    flood_res = client.get("/api/v1/weather/flood-zones")
    assert flood_res.status_code == 200
    f_data = flood_res.json()
    assert f_data["type"] == "FeatureCollection"
    assert isinstance(f_data["features"], list)
    assert len(f_data["features"]) >= 3
    feature = f_data["features"][0]
    assert feature["geometry"]["type"] == "Polygon"
    assert "properties" in feature
    assert "risk_level" in feature["properties"]

def test_sms_webhook_idempotency():
    """Verifies that replaying duplicate carrier SMS webhooks returns HTTP 200 without creating duplicate incidents."""
    carrier_msg_id = f"CARRIER-MSG-TEST-{int(time.time()*1000)}"
    headers = {"X-Carrier-Message-Id": carrier_msg_id}
    payload = {
        "text": f"Mathare 4A house flooded need rescue {carrier_msg_id}",
        "from": "+254712345678",
        "message_id": carrier_msg_id
    }

    db = SessionLocal()
    initial_count = db.query(Incident).count()
    db.close()

    # 1. First delivery
    res1 = client.post("/api/v1/sms/incoming", json=payload, headers=headers)
    assert res1.status_code == 200
    d1 = res1.json()
    assert d1["status"] == "success"
    assert "incident_id" in d1
    first_incident_id = d1["incident_id"]

    db = SessionLocal()
    after_first_count = db.query(Incident).count()
    db.close()
    assert after_first_count == initial_count + 1

    # 2. Replay duplicate delivery with same carrier message id
    res2 = client.post("/api/v1/sms/incoming", json=payload, headers=headers)
    assert res2.status_code == 200
    d2 = res2.json()
    assert d2["status"] == "success"
    assert d2.get("idempotent_replay") is True
    assert d2["incident_id"] == first_incident_id

    # Database count must NOT increase
    db = SessionLocal()
    after_second_count = db.query(Incident).count()
    db.close()
    assert after_second_count == after_first_count

def test_sms_webhook_signature_verification():
    """Verifies HMAC-SHA256 signature verification and carrier secret rejection on telecom gateway."""
    original_secret = settings.SMS_WEBHOOK_SECRET
    test_secret = "test-carrier-secret-key-12345"
    settings.SMS_WEBHOOK_SECRET = test_secret

    try:
        body = b'{"text": "Flooding in Mathare area", "from": "+254700000000"}'
        headers_invalid = {
            "Content-Type": "application/json",
            "X-Hub-Signature-256": "sha256=invalidhash00000000000000000000000000000000000000000000000000"
        }

        # 1. Invalid signature should be rejected with 401
        res_fail = client.post("/api/v1/sms/incoming", content=body, headers=headers_invalid)
        assert res_fail.status_code == 401
        assert "Invalid webhook signature" in res_fail.json()["detail"]

        # 2. Valid signature should pass with 200
        correct_sig = "sha256=" + hmac.new(test_secret.encode(), body, hashlib.sha256).hexdigest()
        headers_valid = {
            "Content-Type": "application/json",
            "X-Hub-Signature-256": correct_sig
        }
        res_ok = client.post("/api/v1/sms/incoming", content=body, headers=headers_valid)
        assert res_ok.status_code == 200
        assert res_ok.json()["status"] == "success"

        # 3. Direct secret header verification
        res_secret = client.post(
            "/api/v1/sms/incoming",
            content=body,
            headers={"Content-Type": "application/json", "X-Webhook-Secret": test_secret}
        )
        assert res_secret.status_code == 200
        assert res_secret.json()["status"] == "success"
    finally:
        settings.SMS_WEBHOOK_SECRET = original_secret

def test_outbound_sms_dispatch_and_idempotency(auth_headers):
    """Verifies outbound SMS dispatch adapter, error resilience, and idempotency key caching."""
    idempotency_key = f"IDEM-OUT-{int(time.time()*1000)}"
    payload = {
        "to_phone": "+254719000111",
        "message": "u-SHA-jua Dispatch: Ambulance AMB-01 is en route to your location. Stay on elevated ground.",
        "idempotency_key": idempotency_key
    }

    # 1. Initial transmission
    res1 = client.post("/api/v1/sms/outbound", json=payload, headers=auth_headers)
    assert res1.status_code == 200
    d1 = res1.json()
    assert d1["status"] == "delivered"
    assert "message_id" in d1
    first_msg_id = d1["message_id"]

    # 2. Duplicate transmission with same idempotency key
    res2 = client.post("/api/v1/sms/outbound", json=payload, headers=auth_headers)
    assert res2.status_code == 200
    d2 = res2.json()
    assert d2["status"] == "delivered"
    assert d2["message_id"] == first_msg_id

    # 3. Validation rejection on invalid phone length
    res_bad = client.post(
        "/api/v1/sms/outbound",
        json={"to_phone": "12", "message": "Test"},
        headers=auth_headers
    )
    assert res_bad.status_code == 422


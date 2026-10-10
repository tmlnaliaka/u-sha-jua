import pytest
import os
import sys
import uuid
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

# Ensure server path is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from main import app
from database import Base, engine, SessionLocal
from models.incident import Incident, IncidentType, UrgencyLevel, IncidentStatus
from models.user import User
from config import settings
from services.auth_service import bootstrap_admin, create_access_token, hash_password
from services.nlp_service import nlp_service

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_db(monkeypatch):
    monkeypatch.setattr(settings, "AUTH_SECRET_KEY", "test-auth-secret-key-that-is-long-enough-for-tests")
    Base.metadata.create_all(bind=engine)
    yield
    # Clean up can be done if needed

@pytest.fixture
def admin_headers():
    db = SessionLocal()
    user = User(
        email=f"admin-{uuid.uuid4()}@example.test",
        display_name="Test Admin",
        password_hash=hash_password("test-admin-password-long"),
        role="admin",
    )
    db.add(user)
    db.commit()
    token = create_access_token(user.id)
    db.close()
    return {"Authorization": f"Bearer {token}"}

def register_survivor(email=None, extra=None):
    payload = {
        "email": email or f"survivor-{uuid.uuid4()}@example.test",
        "display_name": "Test Survivor",
        "password": "test-survivor-password",
    }
    payload.update(extra or {})
    response = client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 201, response.text
    return response.json()

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

def test_invalid_coordinates_validation(admin_headers):
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
    response = client.post("/api/v1/incidents", json=payload, headers=admin_headers)
    assert response.status_code == 422

def test_spatial_feed_geojson_format(admin_headers):
    response = client.get("/api/v1/incidents/spatial-feed", headers=admin_headers)
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

def test_update_incident_status(admin_headers):
    # Create incident first
    payload = {
        "raw_text": "Fire in Gikomba market stalls",
        "device_lat": -1.2850,
        "device_lon": 36.8375
    }
    create_res = client.post("/api/v1/incidents/report", json=payload)
    incident_id = create_res.json()["id"]

    # Dispatch response unit
    patch_res = client.patch(f"/api/v1/incidents/{incident_id}/status", json={"status": "Dispatched"}, headers=admin_headers)
    assert patch_res.status_code == 200
    assert patch_res.json()["status"] == "Dispatched"

    # Resolve incident
    resolve_res = client.patch(f"/api/v1/incidents/{incident_id}/status", json={"status": "Resolved"}, headers=admin_headers)
    assert resolve_res.status_code == 200
    assert resolve_res.json()["status"] == "Resolved"

def test_dispatcher_verification_unlocks_confirmed_state(admin_headers):
    payload = {
        "raw_text": "Smoke and flames reported near Gikomba market",
        "device_lat": -1.2850,
        "device_lon": 36.8375
    }
    incident = client.post("/api/v1/incidents/report", json=payload).json()
    assert incident["verification_status"] == "Unverified"

    response = client.patch(
        f"/api/v1/incidents/{incident['id']}/verification",
        json={"status": "Confirmed", "note": "Visual check by dispatcher"},
        headers=admin_headers,
    )
    assert response.status_code == 200
    assert response.json()["verification_status"] == "Confirmed"
    assert response.json()["verification_note"] == "Visual check by dispatcher"

def test_dispatcher_verification_rejects_missing_token():
    response = client.patch(
        "/api/v1/incidents/nonexistent/verification",
        json={"status": "Confirmed"},
    )
    assert response.status_code == 401

def test_media_report_stores_and_serves_evidence(tmp_path, monkeypatch, admin_headers):
    monkeypatch.setattr(settings, "EVIDENCE_DIRECTORY", str(tmp_path))
    monkeypatch.setattr(nlp_service, "gemini_available", False)
    image_data = bytes.fromhex("89504e470d0a1a0a00000000")
    response = client.post(
        "/api/v1/incidents/report-with-media",
        data={"raw_text": "Floodwater reported near Mathare"},
        files=[("files", ("scene.png", image_data, "image/png"))],
    )
    assert response.status_code == 201
    incident = response.json()
    assert incident["verification_status"] == "Unverified"
    assert len(incident["evidence"]) == 1

    evidence_response = client.get(incident["evidence"][0]["url"], headers=admin_headers)
    assert evidence_response.status_code == 200
    assert evidence_response.content == image_data

def test_evidence_rejects_mismatched_file_signature():
    response = client.post(
        "/api/v1/incidents/report-with-media",
        data={"raw_text": "Smoke near Gikomba"},
        files=[("files", ("not-image.png", b"not a png", "image/png"))],
    )
    assert response.status_code == 415

def test_africastalking_webhook_requires_configured_secret(monkeypatch):
    monkeypatch.setattr(settings, "AFRICASTALKING_WEBHOOK_TOKEN", "")
    response = client.post(
        "/api/v1/integrations/africastalking/sms",
        data={"phoneNumber": "+254712345678", "text": "Fire reported in Mathare"},
    )
    assert response.status_code == 503

def test_africastalking_webhook_creates_incident_without_sms_reply(monkeypatch):
    monkeypatch.setattr(settings, "AFRICASTALKING_WEBHOOK_TOKEN", "test-secret")

    response = client.post(
        "/api/v1/integrations/africastalking/sms?token=test-secret",
        data={"phoneNumber": "+254712345678", "text": "Fire reported near Gikomba market"},
    )
    assert response.status_code == 200
    assert response.content == b""

def test_survivor_registration_and_login():
    email = f"new-{uuid.uuid4()}@example.test"
    payload = {
        "email": email,
        "display_name": "Amina Survivor",
        "password": "long-survivor-password-123",
        "phone_number": "+254712345678",
        "role": "admin",
    }
    registration = client.post("/api/v1/auth/register", json=payload)
    assert registration.status_code == 201
    assert registration.json()["user"]["role"] == "survivor"
    assert client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {registration.json()['access_token']}"},
    ).json()["email"] == email

    login = client.post("/api/v1/auth/login", json={"email": email, "password": payload["password"]})
    assert login.status_code == 200
    assert login.json()["user"]["role"] == "survivor"

def test_invalid_signed_in_session_is_rejected():
    malformed_token = "W10.eyJleHAiOjQwMDAwMDAwMDAsInN1YiI6IngifQ.invalid"
    response = client.get(
        "/api/v1/incidents",
        headers={"Authorization": f"Bearer {malformed_token}"},
    )
    assert response.status_code == 401

def test_admin_is_provisioned_from_server_configuration(monkeypatch):
    email = f"operations-{uuid.uuid4()}@example.test"
    password = "server-provisioned-admin-password"
    monkeypatch.setattr(settings, "ADMIN_EMAIL", email)
    monkeypatch.setattr(settings, "ADMIN_PASSWORD", password)
    monkeypatch.setattr(settings, "ADMIN_NAME", "Operations Admin")

    bootstrap_admin()
    bootstrap_admin()
    response = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    assert response.json()["user"]["role"] == "admin"
    assert response.json()["user"]["display_name"] == "Operations Admin"

def test_survivors_can_only_read_their_own_reports():
    survivor_a = register_survivor()
    survivor_b = register_survivor()
    headers_a = {"Authorization": f"Bearer {survivor_a['access_token']}"}
    headers_b = {"Authorization": f"Bearer {survivor_b['access_token']}"}

    report_a = client.post(
        "/api/v1/incidents/report",
        json={"raw_text": "Flood water rising in Mathare 4A"},
        headers=headers_a,
    )
    report_b = client.post(
        "/api/v1/incidents/report",
        json={"raw_text": "Fire smoke in Gikomba"},
        headers=headers_b,
    )
    assert report_a.status_code == 201
    assert report_b.status_code == 201

    my_reports = client.get("/api/v1/incidents", headers=headers_a)
    assert my_reports.status_code == 200
    assert [incident["id"] for incident in my_reports.json()] == [report_a.json()["id"]]
    assert client.get(f"/api/v1/incidents/{report_b.json()['id']}", headers=headers_a).status_code == 404
    assert client.get("/api/v1/incidents").status_code == 401

def test_survivor_cannot_dispatch_or_confirm_reports():
    survivor = register_survivor()
    headers = {"Authorization": f"Bearer {survivor['access_token']}"}
    report = client.post(
        "/api/v1/incidents/report",
        json={"raw_text": "Smoke near Gikomba market"},
        headers=headers,
    ).json()
    assert client.patch(
        f"/api/v1/incidents/{report['id']}/status",
        json={"status": "Dispatched"},
        headers=headers,
    ).status_code == 403
    assert client.patch(
        f"/api/v1/incidents/{report['id']}/verification",
        json={"status": "Confirmed"},
        headers=headers,
    ).status_code == 403
    assert client.post(
        "/api/v1/incidents",
        json={
            "raw_text": "Manual admin case",
            "incident_type": "Flood",
            "urgency_level": "Low",
            "location_name": "Nairobi",
            "coordinates": {"latitude": -1.2, "longitude": 36.8},
        },
        headers=headers,
    ).status_code == 403

def test_websocket_requires_an_admin_account(admin_headers):
    admin_token = admin_headers["Authorization"].split(" ", 1)[1]
    with client.websocket_connect("/ws/live-incidents") as websocket:
        websocket.send_json({"type": "auth", "token": admin_token})
        assert websocket.receive_json()["event"] == "connection_established"

    survivor = register_survivor()
    with pytest.raises(WebSocketDisconnect) as disconnect:
        with client.websocket_connect("/ws/live-incidents") as websocket:
            websocket.send_json({"type": "auth", "token": survivor["access_token"]})
            websocket.receive_json()
    assert disconnect.value.code == 4403

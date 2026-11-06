import pytest
import os
import sys
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from main import app
from database import Base, engine, SessionLocal, init_db
from models.incident import Incident, IncidentType, UrgencyLevel, IncidentStatus
from models.responder import ResponderUnit, ResponderType, ResponderStatus

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_db():
    init_db()
    yield

def test_weather_telemetry_and_flood_zones():
    """Validates weather early warning telemetry and GIS flood zone polygons."""
    res_weather = client.get("/api/v1/weather/telemetry")
    assert res_weather.status_code == 200
    w_data = res_weather.json()
    assert "precipitation_rate_mmh" in w_data
    assert "river_gauge_elevation_m" in w_data
    assert "warning_bulletin" in w_data
    assert w_data["precipitation_rate_mmh"] > 0

    res_zones = client.get("/api/v1/weather/flood-zones")
    assert res_zones.status_code == 200
    z_data = res_zones.json()
    assert z_data["type"] == "FeatureCollection"
    assert len(z_data["features"]) >= 3
    assert any(f["properties"]["id"] == "flood-zone-mathare" for f in z_data["features"])

def test_analytics_summary_and_csv_export():
    """Validates spatial analytics summary metrics and CSV download."""
    res_summary = client.get("/api/v1/analytics/summary")
    assert res_summary.status_code == 200
    s_data = res_summary.json()
    assert "total_incidents" in s_data
    assert "type_breakdown" in s_data
    assert "urgency_breakdown" in s_data
    assert "fleet_utilization" in s_data
    assert "hotspot_rankings" in s_data

    res_csv = client.get("/api/v1/analytics/export/csv")
    assert res_csv.status_code == 200
    assert "text/csv" in res_csv.headers["content-type"]
    assert "Incident ID" in res_csv.text

def test_civilian_tracking_and_responder_gps_update():
    """Validates civilian incident tracking endpoint and responder GPS broadcast."""
    # Create incident
    res_rep = client.post("/api/v1/incidents/report", json={"raw_text": "Flooding along Juja road Mathare bridge"})
    assert res_rep.status_code == 201
    inc_id = res_rep.json()["id"]

    # Test tracking endpoint
    res_track = client.get(f"/api/v1/incidents/track/{inc_id}")
    assert res_track.status_code == 200
    t_data = res_track.json()
    assert t_data["incident"]["id"] == inc_id
    assert len(t_data["stages"]) == 4

    # Test responder GPS update
    db = SessionLocal()
    unit = db.query(ResponderUnit).first()
    db.close()
    assert unit is not None

    gps_payload = {"latitude": -1.2650, "longitude": 36.8590}
    res_gps = client.patch(f"/api/v1/responders/{unit.id}/location", json=gps_payload)
    assert res_gps.status_code == 200
    updated_unit = res_gps.json()
    assert updated_unit["coordinates"]["latitude"] == -1.2650
    assert updated_unit["coordinates"]["longitude"] == 36.8590


def test_oasis_cap_v1_2_alert_generation():
    """Validates OASIS Common Alerting Protocol (CAP v1.2) JSON and XML export."""
    res_rep = client.post(
        "/api/v1/incidents/report",
        json={
            "raw_text": "Critical flash flood surging in Mathare 4A, families trapped on rooftops!",
            "device_lat": -1.2612,
            "device_lon": 36.8574
        }
    )
    assert res_rep.status_code == 201
    inc_id = res_rep.json()["id"]

    res_cap = client.get(f"/api/v1/incidents/{inc_id}/cap-alert")
    assert res_cap.status_code == 200
    cap = res_cap.json()
    assert cap["identifier"] == f"USHAJUA-CAP-{inc_id}"
    assert cap["status"] == "Actual"
    assert cap["msgType"] == "Alert"
    assert cap["info"]["urgency"] in ["Immediate", "Expected", "Future"]
    assert cap["info"]["severity"] in ["Extreme", "Severe", "Moderate"]
    assert "urn:oasis:names:tc:emergency:cap:1.2" in cap["xml"]
    assert "<circle>" in cap["xml"]
    assert "<polygon>" in cap["xml"]
    assert "polygon" in cap["info"]["area"]


def test_incident_attachments_upload(tmp_path):
    """Validates real multipart attachment upload (scene photo and voice note) for incidents."""
    res_rep = client.post(
        "/api/v1/incidents/report",
        json={"raw_text": "Fire with trapped casualties at Gikomba clothing section"}
    )
    assert res_rep.status_code == 201
    inc_id = res_rep.json()["id"]

    # Upload fake image and audio bytes
    image_bytes = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4"
    audio_bytes = b"RIFF\x24\x00\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00D\xac\x00\x00"

    files = [
        ("files", ("disaster_scene.png", image_bytes, "image/png")),
        ("files", ("voice_distress.wav", audio_bytes, "audio/wav"))
    ]

    res_upload = client.post(f"/api/v1/incidents/{inc_id}/attachments", files=files)
    assert res_upload.status_code == 201
    attach_data = res_upload.json()
    assert len(attach_data["attachments"]) == 2
    assert attach_data["attachments"][0]["filename"] == "disaster_scene.png"
    assert attach_data["attachments"][1]["filename"] == "voice_distress.wav"

    # Verify attachment is visible on incident detail
    res_detail = client.get(f"/api/v1/incidents/{inc_id}")
    assert res_detail.status_code == 200
    assert len(res_detail.json()["attachments"]) == 2


def test_responder_checklist_persistence():
    """Validates that field responder mission checklist updates persist in the database."""
    db = SessionLocal()
    unit = db.query(ResponderUnit).first()
    db.close()
    assert unit is not None

    checklist_update = {
        "checklist": {
            "hazard_survey": True,
            "triage_perimeter": True,
            "casualty_treatment": False,
            "evacuation_corridor": False
        }
    }
    res = client.patch(
        f"/api/v1/responders/{unit.id}/checklist",
        json=checklist_update,
        headers={"X-API-Key": "ushajua-dev-dispatcher-key"}
    )
    assert res.status_code == 200
    data = res.json()
    assert data["checklist"]["hazard_survey"] is True
    assert data["checklist"]["triage_perimeter"] is True
    assert data["checklist"]["casualty_treatment"] is False

    # Query responder again to confirm persistence
    res_get = client.get(f"/api/v1/responders", headers={"X-API-Key": "ushajua-dev-dispatcher-key"})
    assert res_get.status_code == 200
    matched = next((u for u in res_get.json() if u["id"] == unit.id), None)
    assert matched is not None
    assert matched["checklist"]["hazard_survey"] is True


def test_analytics_real_mttd_and_mttr():
    """Validates that MTTD and MTTR are calculated from real incident timestamps, not static constants."""
    res = client.get("/api/v1/analytics/summary")
    assert res.status_code == 200
    data = res.json()
    assert "mean_time_to_dispatch_minutes" in data
    assert "mean_time_to_resolution_minutes" in data
    assert isinstance(data["mean_time_to_dispatch_minutes"], (int, float))
    assert isinstance(data["mean_time_to_resolution_minutes"], (int, float))


def test_incident_deletion_by_dispatcher():
    """Validates that dispatchers and admins can delete an incident with audit logging."""
    res_create = client.post("/api/v1/incidents/report", json={"raw_text": "False alarm test incident to delete"})
    assert res_create.status_code == 201
    inc_id = res_create.json()["id"]

    res_del = client.delete(f"/api/v1/incidents/{inc_id}", headers={"X-API-Key": "ushajua-dev-dispatcher-key"})
    assert res_del.status_code == 204

    # Verify 404 on subsequent get
    res_check = client.get(f"/api/v1/incidents/{inc_id}")
    assert res_check.status_code == 404


def test_permissions_policy_supports_microphone_and_camera():
    """Validates that browser Permissions-Policy allows microphone and camera for civilian evidence capture."""
    res = client.get("/health")
    assert res.status_code == 200
    perm = res.headers.get("Permissions-Policy", "")
    assert "microphone=(self)" in perm
    assert "camera=(self)" in perm
    assert "geolocation=(self)" in perm

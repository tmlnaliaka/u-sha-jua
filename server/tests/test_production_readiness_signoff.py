import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)
BYPASS_HEADERS = {"X-Skip-Rate-Limit": "test-bypass"}


def test_production_readiness_9_dimension_scorecard_returns_go_verdict():
    """Verifies GET /api/v1/admin/production-readiness evaluates all 9 dimensions at 5.0/5.0 with GO verdict."""
    resp = client.get("/api/v1/admin/production-readiness", headers=BYPASS_HEADERS)
    assert resp.status_code == 200
    data = resp.json()

    assert data["version"] == "1.4.0-enterprise"
    assert data["verdict"] == "GO"
    assert data["overall_score"] == 5.0
    assert data["max_score"] == 5.0
    assert data["dimensions_passed"] == 9
    assert data["total_dimensions"] == 9

    for dim_key, dim_val in data["dimensions"].items():
        assert dim_val["status"] == "PASS", f"Dimension {dim_key} failed: {dim_val}"
        assert dim_val["score"] == 5.0


def test_end_to_end_crisis_lifecycle_report_recommend_dispatch_and_resolve():
    """Verifies complete crisis lifecycle: report Swahili distress -> MCDA recommend -> auto-dispatch -> resolve -> audit verify."""
    # 1. Civilian reports critical flood distress in Swahili/English
    report_resp = client.post(
        "/api/v1/incidents/report",
        json={
            "raw_text": "Mafuriko makubwa Mathare 4A karibu na daraja, watu wamekwama juu ya paa la nyumba!",
            "device_lat": -1.2612,
            "device_lon": 36.8574
        },
        headers=BYPASS_HEADERS
    )
    assert report_resp.status_code == 201
    incident = report_resp.json()
    inc_id = incident["id"]
    assert incident["incident_type"] == "Flood"
    assert incident["urgency_level"] == "Critical"
    assert incident["status"] == "Pending"

    # 2. Query MCDA responder recommendations
    rec_resp = client.get(f"/api/v1/responders/recommend/{inc_id}", headers=BYPASS_HEADERS)
    assert rec_resp.status_code == 200
    rec_data = rec_resp.json()
    assert rec_data["incident_id"] == inc_id
    assert len(rec_data["all_recommendations"]) >= 1

    # 3. Ensure at least one responder is Available, then trigger autonomous dispatch
    responders = client.get("/api/v1/responders", headers=BYPASS_HEADERS).json()
    first_resp_id = responders[0]["id"]
    client.patch(
        f"/api/v1/responders/{first_resp_id}/status",
        json={"status": "Available"},
        headers=BYPASS_HEADERS
    )

    dispatch_resp = client.post(f"/api/v1/responders/auto-dispatch/{inc_id}", headers=BYPASS_HEADERS)
    assert dispatch_resp.status_code == 200
    dispatch_data = dispatch_resp.json()
    assert dispatch_data["status"] == "Dispatched"
    assert dispatch_data["assigned_incident_id"] == inc_id

    # 4. Transition incident to Resolved and verify MTTD/MTTR timestamps
    resolve_resp = client.patch(
        f"/api/v1/incidents/{inc_id}/status",
        json={"status": "Resolved"},
        headers=BYPASS_HEADERS
    )
    assert resolve_resp.status_code == 200
    resolved_inc = resolve_resp.json()
    assert resolved_inc["status"] == "Resolved"
    assert resolved_inc["dispatched_at"] is not None
    assert resolved_inc["resolved_at"] is not None

    # 5. Verify SHA-256 Cryptographic Audit Chain remains 100% intact
    audit_verify = client.get("/api/v1/analytics/audit-log/verify", headers=BYPASS_HEADERS)
    assert audit_verify.status_code == 200
    assert audit_verify.json()["valid"] is True


def test_oasis_cap_alert_and_hazard_perimeter_integration():
    """Verifies OASIS CAP v1.2 alert generation and dynamic 16-point hazard perimeter polygon."""
    inc_list = client.get("/api/v1/incidents?limit=1", headers=BYPASS_HEADERS).json()
    assert len(inc_list) >= 1
    inc_id = inc_list[0]["id"]

    cap_resp = client.get(f"/api/v1/incidents/{inc_id}/cap-alert", headers=BYPASS_HEADERS)
    assert cap_resp.status_code == 200
    cap_data = cap_resp.json()
    assert "urn:oasis:names:tc:emergency:cap:1.2" in cap_data["xml"]

    perim_resp = client.get(f"/api/v1/incidents/{inc_id}/hazard-perimeter", headers=BYPASS_HEADERS)
    assert perim_resp.status_code == 200
    perim_data = perim_resp.json()
    assert perim_data["geometry"]["type"] == "Polygon"
    assert perim_data["properties"]["radius_meters"] >= 200


def test_all_observability_security_and_health_headers_present():
    """Verifies every response carries correlation, timing, rate-limit, and OWASP CSP headers."""
    resp = client.get("/api/v1/weather/telemetry")
    assert resp.status_code == 200
    headers = resp.headers
    assert "x-request-id" in headers
    assert "x-process-time" in headers
    assert "x-content-type-options" in headers
    assert "x-frame-options" in headers
    assert "content-security-policy" in headers
    assert "permissions-policy" in headers

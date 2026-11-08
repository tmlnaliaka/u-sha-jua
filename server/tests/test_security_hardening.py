import pytest
from fastapi.testclient import TestClient
from main import app
from database import Base, engine, SessionLocal
from config import settings
from services.security import rate_limiter

client = TestClient(app)

@pytest.fixture(autouse=True)
def reset_rate_limits():
    rate_limiter.reset()
    yield
    rate_limiter.reset()

def test_rate_limit_headers_on_standard_request():
    response = client.get(
        "/api/v1/incidents?limit=5",
        headers={"X-Forwarded-For": "10.0.0.1"}
    )
    assert response.status_code == 200
    assert "X-RateLimit-Limit" in response.headers
    assert "X-RateLimit-Remaining" in response.headers
    assert "X-RateLimit-Reset" in response.headers
    assert int(response.headers["X-RateLimit-Limit"]) == 300

def test_auth_rate_limiting_exceeded_returns_429():
    test_ip = "10.99.1.50"
    for i in range(10):
        res = client.post(
            "/api/v1/auth/login",
            json={"email": "attacker@victim.com", "password": "wrongpassword"},
            headers={"X-Forwarded-For": test_ip}
        )
        assert res.status_code in [400, 401, 422]

    blocked_res = client.post(
        "/api/v1/auth/login",
        json={"email": "attacker@victim.com", "password": "wrongpassword"},
        headers={"X-Forwarded-For": test_ip}
    )
    assert blocked_res.status_code == 429
    data = blocked_res.json()
    assert data["error"] == "RATE_LIMIT_EXCEEDED"
    assert "Retry-After" in blocked_res.headers
    assert int(blocked_res.headers["Retry-After"]) >= 1
    assert blocked_res.headers["X-RateLimit-Remaining"] == "0"

def test_incident_creation_rate_limiting():
    test_ip = "10.99.1.51"
    for i in range(30):
        res = client.post(
            "/api/v1/incidents/report",
            json={"raw_text": f"Minor leak report #{i} near Kasarani"},
            headers={"X-Forwarded-For": test_ip}
        )
        assert res.status_code in [201, 200]

    res_blocked = client.post(
        "/api/v1/incidents/report",
        json={"raw_text": "Spam flood attack incident"},
        headers={"X-Forwarded-For": test_ip}
    )
    assert res_blocked.status_code == 429
    assert res_blocked.json()["error"] == "RATE_LIMIT_EXCEEDED"

def test_rate_limit_bypass_with_admin_secret():
    test_ip = "10.99.1.52"
    for i in range(15):
        res = client.post(
            "/api/v1/auth/login",
            json={"email": "admin@ushajua.org", "password": "invalidpassword"},
            headers={
                "X-Forwarded-For": test_ip,
                "X-Skip-Rate-Limit": settings.ADMIN_API_KEY
            }
        )
        assert res.status_code != 429

def test_strict_csp_and_security_headers():
    response = client.get("/api/v1/weather/telemetry")
    assert response.status_code == 200
    headers = response.headers
    assert headers["X-Frame-Options"] == "DENY"
    assert headers["X-Content-Type-Options"] == "nosniff"
    assert headers["Referrer-Policy"] == "strict-origin-when-cross-origin"
    assert "geolocation=(self)" in headers["Permissions-Policy"]
    assert "microphone=(self)" in headers["Permissions-Policy"]
    assert "camera=(self)" in headers["Permissions-Policy"]
    csp = headers["Content-Security-Policy"]
    assert "frame-ancestors 'none'" in csp
    assert "object-src 'none'" in csp
    assert "*.tile.openstreetmap.org" in csp
    assert "connect-src" in csp

def test_xss_injection_sanitization_on_incident_submission():
    payload = {
        "raw_text": "<script>alert('pwned')</script>Trapped on rooftop in Mukuru <img src=x onerror=alert(1)>",
        "device_lat": -1.3197,
        "device_lon": 36.8770
    }
    response = client.post(
        "/api/v1/incidents/report",
        json=payload,
        headers={"X-Forwarded-For": "10.99.1.53"}
    )
    assert response.status_code == 201
    created = response.json()
    assert "<script>" not in created["raw_text"]
    assert "alert('pwned')" not in created["raw_text"]
    assert "Trapped on rooftop in Mukuru" in created["raw_text"]

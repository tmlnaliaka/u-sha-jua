import pytest
from fastapi.testclient import TestClient
from main import app
from config import settings

client = TestClient(app)

@pytest.fixture
def auth_headers():
    return {"X-API-Key": settings.DISPATCHER_API_KEY}

def test_weather_telemetry_cache_control_headers():
    """Verifies weather radar telemetry returns high-performance stale-while-revalidate Cache-Control header."""
    res = client.get("/api/v1/weather/telemetry")
    assert res.status_code == 200
    assert "Cache-Control" in res.headers
    cache_control = res.headers["Cache-Control"]
    assert "public" in cache_control
    assert "stale-while-revalidate" in cache_control

def test_incidents_realtime_cache_control_headers(auth_headers):
    """Verifies real-time incident ledger enforces no-cache to avoid stale crisis state."""
    res = client.get("/api/v1/incidents?limit=5", headers=auth_headers)
    assert res.status_code == 200
    assert "Cache-Control" in res.headers
    cache_control = res.headers["Cache-Control"]
    assert "no-cache" in cache_control
    assert "must-revalidate" in cache_control

def test_shelters_short_cache_headers():
    """Verifies evacuation shelters use bounded cache-control headers."""
    res = client.get("/api/v1/shelters")
    assert res.status_code == 200
    assert "Cache-Control" in res.headers
    assert "max-age=10" in res.headers["Cache-Control"]

def test_response_time_header_present():
    """Verifies latency profiling header X-Process-Time is injected on every request."""
    res = client.get("/health")
    assert res.status_code == 200
    assert "X-Process-Time" in res.headers
    process_time = res.headers["X-Process-Time"]
    assert process_time.endswith("s")

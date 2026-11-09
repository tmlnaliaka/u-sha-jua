import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)
BYPASS_HEADERS = {"X-Skip-Rate-Limit": "test-bypass"}


def test_telemetry_metrics_endpoint_returns_complete_schema():
    """Verifies GET /api/v1/telemetry/metrics exposes request counters, latency percentiles, and subsystem gauges."""
    # Trigger a couple of requests first so counters and latencies populate
    client.get("/healthz", headers=BYPASS_HEADERS)
    client.get("/api/v1/incidents?limit=5", headers=BYPASS_HEADERS)

    resp = client.get("/api/v1/telemetry/metrics", headers=BYPASS_HEADERS)
    assert resp.status_code == 200
    data = resp.json()

    assert data["status"] == "operational"
    assert isinstance(data["uptime_seconds"], (int, float))
    assert "requests" in data
    assert data["requests"]["total"] >= 2
    assert "errors_4xx" in data["requests"]
    assert "errors_5xx" in data["requests"]
    assert "rate_limited_429" in data["requests"]
    assert "client_crashes" in data["requests"]

    assert "latency_ms" in data
    assert "avg" in data["latency_ms"]
    assert "p95" in data["latency_ms"]
    assert "max" in data["latency_ms"]
    assert data["latency_ms"]["sample_size"] >= 2

    assert "subsystems" in data
    assert "spatial_grid_items" in data["subsystems"]
    assert "spatial_cache_hits" in data["subsystems"]
    assert "spatial_cache_misses" in data["subsystems"]
    assert "active_ws_connections" in data["subsystems"]
    assert "audit_ledger_blocks" in data["subsystems"]
    assert isinstance(data["top_routes"], list)


def test_structured_logs_endpoint_records_request_correlation():
    """Verifies GET /api/v1/telemetry/logs captures structured request entries with custom X-Request-ID."""
    custom_req_id = "obs-test-corr-998877"
    client.get(
        "/api/v1/shelters",
        headers={**BYPASS_HEADERS, "X-Request-ID": custom_req_id}
    )

    resp = client.get("/api/v1/telemetry/logs?limit=25", headers=BYPASS_HEADERS)
    assert resp.status_code == 200
    body = resp.json()
    assert "count" in body
    assert "logs" in body
    assert body["count"] == len(body["logs"])

    matching = [entry for entry in body["logs"] if entry.get("request_id") == custom_req_id]
    assert len(matching) >= 1
    log_entry = matching[0]
    assert log_entry["service"] == "ushajua-api"
    assert log_entry["method"] == "GET"
    assert log_entry["path"] == "/api/v1/shelters"
    assert log_entry["status_code"] == 200
    assert isinstance(log_entry["duration_ms"], (int, float))


def test_client_error_telemetry_ingestion_and_audit_ledger():
    """Verifies POST /api/v1/telemetry/client-error stores client crash snapshots and appends to SHA-256 audit ledger."""
    metrics_before = client.get("/api/v1/telemetry/metrics", headers=BYPASS_HEADERS).json()
    crashes_before = metrics_before["requests"]["client_crashes"]
    blocks_before = metrics_before["subsystems"]["audit_ledger_blocks"]

    crash_payload = {
        "message": "Simulated Tactical Map WebGL Context Lost",
        "stack": "Error: Simulated Tactical Map WebGL Context Lost\n    at DisasterMap.tsx:142:15",
        "componentStack": "\n    in DisasterMap\n    in ErrorBoundary",
        "url": "http://localhost:5173/",
        "userAgent": "Playwright-Observability-Test/1.0",
        "timestamp": "2026-11-09T10:15:00Z"
    }

    post_resp = client.post(
        "/api/v1/telemetry/client-error",
        json=crash_payload,
        headers=BYPASS_HEADERS
    )
    assert post_resp.status_code == 201
    post_data = post_resp.json()
    assert post_data["status"] == "recorded"
    crash_id = post_data["crash"]["crash_id"]
    assert crash_id.startswith("crash-")
    assert post_data["crash"]["message"] == "Simulated Tactical Map WebGL Context Lost"

    # Verify metrics & audit block count incremented
    metrics_after = client.get("/api/v1/telemetry/metrics", headers=BYPASS_HEADERS).json()
    assert metrics_after["requests"]["client_crashes"] == crashes_before + 1
    assert metrics_after["subsystems"]["audit_ledger_blocks"] >= blocks_before + 1

    # Verify GET /api/v1/telemetry/client-errors lists the reported crash
    list_resp = client.get("/api/v1/telemetry/client-errors?limit=10", headers=BYPASS_HEADERS)
    assert list_resp.status_code == 200
    crashes_list = list_resp.json()["crashes"]
    assert any(c["crash_id"] == crash_id for c in crashes_list)


def test_deep_health_liveness_and_readiness_probes():
    """Verifies /health, /healthz, and /readyz return accurate database, spatial index, and audit chain probes."""
    liveness = client.get("/healthz")
    assert liveness.status_code == 200
    assert liveness.json() == {"status": "alive"}

    readiness = client.get("/readyz")
    assert readiness.status_code == 200
    assert readiness.json() == {"status": "ready"}

    deep_health = client.get("/health")
    assert deep_health.status_code == 200
    h_data = deep_health.json()
    assert h_data["status"] == "healthy"
    assert h_data["database"]["connected"] is True
    assert h_data["audit_chain_verified"] is True
    assert h_data["audit_ledger_blocks"] >= 1
    assert isinstance(h_data["spatial_grid_items"], int)


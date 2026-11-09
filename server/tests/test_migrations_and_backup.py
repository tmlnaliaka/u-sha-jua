import copy
import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)
BYPASS_HEADERS = {"X-Skip-Rate-Limit": "test-bypass"}


def test_schema_migrations_applied_and_tracked():
    """Verifies GET /api/v1/admin/migrations returns applied migrations (001, 002, 003) and active B-Tree indexes."""
    resp = client.get("/api/v1/admin/migrations", headers=BYPASS_HEADERS)
    assert resp.status_code == 200
    data = resp.json()

    assert data["head_version"] == "003"
    assert data["total_applied"] >= 3
    versions = [m["version"] for m in data["migrations"]]
    assert "001" in versions
    assert "002" in versions
    assert "003" in versions

    for m in data["migrations"]:
        assert len(m["checksum"]) == 64
        assert m["applied_at"]

    indexes = data["active_indexes"]
    assert "idx_incidents_lat_lon" in indexes
    assert "idx_incidents_status_urgency_ts" in indexes
    assert "idx_responders_status_type" in indexes
    assert "idx_shelters_active_coords" in indexes


def test_composite_indexes_and_query_plan_optimization():
    """Verifies GET /api/v1/admin/query-plan confirms B-Tree index utilization via EXPLAIN QUERY PLAN."""
    resp = client.get("/api/v1/admin/query-plan", headers=BYPASS_HEADERS)
    assert resp.status_code == 200
    data = resp.json()

    assert data["all_queries_indexed"] is True
    plans = data["query_plans"]
    assert any("idx_incidents_lat_lon" in step for step in plans["spatial_bbox_query"])
    assert any("idx_incidents_status_urgency_ts" in step for step in plans["triage_status_urgency_query"])
    assert any("idx_shelters_active_coords" in step for step in plans["active_shelters_spatial_query"])


def test_portable_snapshot_export_and_sha256_checksum():
    """Verifies GET /api/v1/admin/backup/snapshot exports incidents, responders, and shelters with SHA-256 checksum."""
    resp = client.get("/api/v1/admin/backup/snapshot", headers=BYPASS_HEADERS)
    assert resp.status_code == 200
    snap = resp.json()

    assert snap["snapshot_id"].startswith("snap-")
    assert len(snap["sha256_checksum"]) == 64
    assert "record_counts" in snap
    assert snap["record_counts"]["incidents"] == len(snap["data"]["incidents"])
    assert snap["record_counts"]["responder_units"] == len(snap["data"]["responder_units"])
    assert snap["record_counts"]["evacuation_shelters"] == len(snap["data"]["evacuation_shelters"])


def test_snapshot_restore_recovers_data_and_rejects_tampered_checksum():
    """Verifies POST /api/v1/admin/backup/restore rejects tampered snapshots (400) and restores valid snapshots (200)."""
    # 1. Create a distinct incident so we have a known record to snapshot and restore
    create_resp = client.post(
        "/api/v1/incidents/report",
        json={
            "raw_text": "Phase 14 Backup & Restore verification flood alert at Nairobi Dam",
            "latitude": -1.3185,
            "longitude": 36.8012
        },
        headers=BYPASS_HEADERS
    )
    assert create_resp.status_code == 201
    created_inc_id = create_resp.json()["id"]

    # 2. Export full snapshot
    snap_resp = client.get("/api/v1/admin/backup/snapshot", headers=BYPASS_HEADERS)
    assert snap_resp.status_code == 200
    valid_snapshot = snap_resp.json()

    # Verify our created incident is inside the exported snapshot
    snap_inc_ids = [inc["id"] for inc in valid_snapshot["data"]["incidents"]]
    assert created_inc_id in snap_inc_ids

    # 3. Tamper with snapshot data without updating sha256_checksum -> must be rejected with 400
    tampered_snapshot = copy.deepcopy(valid_snapshot)
    tampered_snapshot["data"]["incidents"][0]["raw_text"] = "FORGED PAYLOAD TAMPERING ATTEMPT"
    bad_restore = client.post(
        "/api/v1/admin/backup/restore",
        json=tampered_snapshot,
        headers=BYPASS_HEADERS
    )
    assert bad_restore.status_code == 400
    assert "integrity check failed" in bad_restore.json()["message"].lower()

    # 4. Restore valid snapshot -> must succeed and verify checksum
    good_restore = client.post(
        "/api/v1/admin/backup/restore",
        json=valid_snapshot,
        headers=BYPASS_HEADERS
    )
    assert good_restore.status_code == 200
    res_data = good_restore.json()
    assert res_data["status"] == "restored"
    assert res_data["checksum_verified"] is True
    assert res_data["sha256_checksum"] == valid_snapshot["sha256_checksum"]
    assert res_data["restored_counts"]["incidents"] >= 1

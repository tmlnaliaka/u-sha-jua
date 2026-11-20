import io
import os
import time
import pytest
from fastapi.testclient import TestClient
from main import app, run_periodic_maintenance_cycle, MAINTENANCE_STATE
from database import engine
from services.cache_service import HybridCacheAdapter, cache_service
from services.auth_service import auth_service
from services.security import rate_limiter
from services.storage_service import LocalStorageProvider, S3StorageProvider, get_storage_provider
from migrations.runner import run_migrations, get_migration_status, rollback_migration


client = TestClient(app)
ADMIN_HEADERS = {"X-API-Key": "ushajua-dev-admin-key", "x-skip-rate-limit": "ushajua-dev-admin-key"}


def test_sprint2_hybrid_cache_adapter_kv_and_ttl():
    """Sprint 2: Verifies HybridCacheAdapter key-value storage, TTL expiry, and hash counters."""
    adapter = HybridCacheAdapter(redis_url="")
    assert adapter.backend_mode == "in_memory"

    adapter.set("test:key1", "val1", ttl_seconds=60.0)
    assert adapter.get("test:key1") == "val1"
    assert adapter.exists("test:key1") is True

    # Short TTL expiration
    adapter.set("test:ephemeral", "gone", ttl_seconds=0.01)
    time.sleep(0.03)
    assert adapter.get("test:ephemeral") is None
    assert adapter.exists("test:ephemeral") is False

    # Shared hash counters
    assert adapter.hincrby("test:metrics", "hits", 1) == 1
    assert adapter.hincrby("test:metrics", "hits", 4) == 5
    assert adapter.hgetall("test:metrics")["hits"] == 5


def test_sprint2_sliding_window_and_jwt_revocation_sync():
    """Sprint 2: Verifies sliding-window rate limiting and JWT revocation via cache_service."""
    adapter = HybridCacheAdapter(redis_url="")
    bucket = "unit_test_ip"
    a1, rem1, _ = adapter.sliding_window_allow(bucket, max_requests=2, window_seconds=10.0)
    a2, rem2, _ = adapter.sliding_window_allow(bucket, max_requests=2, window_seconds=10.0)
    a3, rem3, retry = adapter.sliding_window_allow(bucket, max_requests=2, window_seconds=10.0)

    assert a1 is True and rem1 == 1
    assert a2 is True and rem2 == 0
    assert a3 is False and rem3 == 0 and retry >= 1.0

    adapter.reset_sliding_window(bucket)
    a4, _, _ = adapter.sliding_window_allow(bucket, max_requests=2, window_seconds=10.0)
    assert a4 is True

    # Verify JWT revocation persists in cache_service
    token = auth_service.create_access_token("u-test-1", "dispatcher", "sync@ushajua.org")
    payload = auth_service.decode_token(token)
    jti = payload["jti"]
    assert auth_service.is_token_revoked(jti) is False

    auth_service.revoke_token(token)
    assert cache_service.exists(f"revoked:{jti}") is True
    assert auth_service.is_token_revoked(jti) is True


def test_sprint3_background_maintenance_scheduler_and_auto_backup():
    """Sprint 3: Verifies periodic maintenance cycle purges stale records and writes SHA-256 auto snapshot."""
    result = run_periodic_maintenance_cycle(perform_backup=True)
    assert result["status"] == "completed"
    assert result["cycles_completed"] >= 1
    assert result["backup_file"] is not None
    assert os.path.exists(result["backup_file"])
    # Clean up generated test snapshot so test suite leaves zero disk bloat
    try:
        os.remove(result["backup_file"])
    except OSError:
        pass

    # Also test admin maintenance endpoint
    resp = client.post("/api/v1/admin/maintenance/run?perform_backup=false", headers=ADMIN_HEADERS)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "completed"

    # Check /health exposes maintenance_scheduler, cache_backend, and storage_backend
    health_resp = client.get("/health")
    assert health_resp.status_code == 200
    hdata = health_resp.json()
    assert "maintenance_scheduler" in hdata
    assert hdata["cache_backend"] in ("in_memory", "redis")
    assert hdata["storage_backend"] in ("local", "s3")


def test_sprint4_reversible_migrations_and_rollback_endpoint():
    """Sprint 4: Verifies downward migration rollback (003 -> 002) and forward re-application (002 -> 003)."""
    run_migrations(engine)
    initial_status = get_migration_status(engine)
    assert initial_status["head_version"] == "003"
    assert "idx_incidents_lat_lon" in initial_status["active_indexes"]

    # Rollback to version 002 via API
    rb_resp = client.post(
        "/api/v1/admin/migrations/rollback",
        json={"target_version": "002"},
        headers=ADMIN_HEADERS
    )
    assert rb_resp.status_code == 200
    rb_data = rb_resp.json()
    assert rb_data["status"] == "rolled_back"
    assert rb_data["head_version"] == "002"
    assert rb_data["rolled_back_count"] == 1
    assert "idx_incidents_lat_lon" not in rb_data["active_indexes"]

    # Re-apply migrations back to 003 so database remains at head with all indexes
    run_resp = client.post("/api/v1/admin/migrations/run", headers=ADMIN_HEADERS)
    assert run_resp.status_code == 200
    run_data = run_resp.json()
    assert run_data["head_version"] == "003"
    assert "idx_incidents_lat_lon" in run_data["active_indexes"]


def test_sprint5_local_and_s3_storage_providers(tmp_path):
    """Sprint 5: Verifies LocalStorageProvider and S3StorageProvider save, URL generation, and deletion."""
    local_prov = LocalStorageProvider(base_dir=str(tmp_path / "uploads_local"))
    assert local_prov.provider_name == "local"

    sample_bytes = b"simulated disaster flood photo bytes"
    meta_local = local_prov.save_file(
        incident_id="inc-local-100",
        filename="flood_scene.jpg",
        file_obj=io.BytesIO(sample_bytes),
        content_type="image/jpeg"
    )
    assert meta_local["filename"] == "flood_scene.jpg"
    assert meta_local["url"] == "/uploads/inc-local-100/flood_scene.jpg"
    assert meta_local["size_bytes"] == len(sample_bytes)
    assert meta_local["storage_backend"] == "local"
    assert local_prov.delete_incident_files("inc-local-100") == 1

    # S3 provider (with offline local mirror fallback when AWS credentials are not set)
    s3_prov = S3StorageProvider(
        bucket="ushajua-kenya-crisis",
        region="af-south-1",
        local_fallback_dir=str(tmp_path / "uploads_s3_mirror")
    )
    assert s3_prov.provider_name == "s3"
    meta_s3 = s3_prov.save_file(
        incident_id="inc-s3-200",
        filename="rescue_audio.ogg",
        file_obj=io.BytesIO(b"ogg audio distress payload"),
        content_type="audio/ogg"
    )
    assert meta_s3["filename"] == "rescue_audio.ogg"
    assert meta_s3["object_key"] == "incidents/inc-s3-200/rescue_audio.ogg"
    assert meta_s3["storage_backend"] == "s3"
    assert s3_prov.delete_incident_files("inc-s3-200") >= 1

    # Factory check
    assert get_storage_provider("local").provider_name == "local"
    assert get_storage_provider("s3").provider_name == "s3"


import os
from typing import Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from database import get_db, engine
from migrations.runner import run_migrations, get_migration_status
from services.backup_service import backup_service

router = APIRouter(prefix="/admin", tags=["Database Migrations & Disaster Backup"])


@router.get("/migrations")
def list_schema_migrations() -> Dict[str, Any]:
    """
    Returns the deterministic schema migration history (`schema_migrations` table)
    and active B-Tree spatial/composite indexes on the database engine.
    """
    run_migrations(engine)
    return get_migration_status(engine)


@router.post("/migrations/run")
def trigger_schema_migrations() -> Dict[str, Any]:
    """
    Idempotently executes all registered schema migrations and returns their execution summary.
    """
    applied = run_migrations(engine)
    status_info = get_migration_status(engine)
    return {
        "status": "completed",
        "head_version": status_info["head_version"],
        "migrations": applied,
        "active_indexes": status_info["active_indexes"]
    }


@router.get("/backup/snapshot")
def export_disaster_snapshot(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """
    Exports a portable JSON crisis database snapshot (incidents, responder_units, evacuation_shelters)
    sealed with a canonical SHA-256 cryptographic checksum.
    """
    return backup_service.export_snapshot(db, engine)


@router.post("/backup/restore")
def restore_disaster_snapshot(snapshot: Dict[str, Any], db: Session = Depends(get_db)) -> Dict[str, Any]:
    """
    Verifies the SHA-256 checksum of a crisis snapshot payload and transactionally restores
    all incidents, responder units, and evacuation shelters while re-synchronizing the spatial index.
    """
    try:
        return backup_service.restore_snapshot(db, snapshot)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc)
        )


@router.get("/query-plan")
def inspect_query_plans() -> Dict[str, Any]:
    """
    Executes EXPLAIN QUERY PLAN on spatial bounding-box and status/urgency triage queries
    to verify composite B-Tree index utilization (`idx_incidents_lat_lon`, `idx_incidents_status_urgency_ts`).
    """
    run_migrations(engine)
    return backup_service.analyze_query_plans(engine)


@router.get("/deployment-audit")
def inspect_deployment_hardening() -> Dict[str, Any]:
    """
    Audits Docker multi-stage build manifests, non-root user isolation (`USER ushajua`),
    Nginx reverse-proxy WebSocket/API rules, `.env.example` secret template parity,
    and GitHub Actions CI/CD quality gates.
    """
    server_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    root_dir = os.path.abspath(os.path.join(server_dir, ".."))
    client_dir = os.path.join(root_dir, "client")

    def _read(path: str) -> str:
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                return f.read()
        return ""

    server_df = _read(os.path.join(server_dir, "Dockerfile"))
    client_df = _read(os.path.join(client_dir, "Dockerfile"))
    nginx_conf = _read(os.path.join(client_dir, "nginx.conf"))
    compose_yml = _read(os.path.join(root_dir, "docker-compose.yml"))
    ci_yml = _read(os.path.join(root_dir, ".github", "workflows", "ci.yml"))
    server_env_ex = _read(os.path.join(server_dir, ".env.example"))

    checks = {
        "server_multistage_build": "AS builder" in server_df and "AS runtime" in server_df,
        "server_non_root_user": "USER ushajua" in server_df,
        "server_healthcheck_probe": "HEALTHCHECK" in server_df and "/healthz" in server_df,
        "server_no_dev_reload": "--reload" not in server_df,
        "client_multistage_build": "AS builder" in client_df and "AS runtime" in client_df,
        "nginx_api_reverse_proxy": "location /api/v1/" in nginx_conf and "proxy_pass" in nginx_conf,
        "nginx_ws_upgrade_tunnel": "location /ws" in nginx_conf and "Upgrade $http_upgrade" in nginx_conf,
        "nginx_owasp_headers": "X-Frame-Options" in nginx_conf and "X-Content-Type-Options" in nginx_conf,
        "compose_parameterized_secrets": "${POSTGRES_PASSWORD" in compose_yml and "condition: service_healthy" in compose_yml,
        "ci_pipeline_3_stage_gates": (
            "backend-verify:" in ci_yml
            and "frontend-verify:" in ci_yml
            and "deployment-config-audit:" in ci_yml
        ),
        "env_example_documented": "DATABASE_URL=" in server_env_ex and "ENFORCE_STRICT_AUTH=" in server_env_ex
    }

    all_passed = all(checks.values())
    return {
        "status": "hardened" if all_passed else "degraded",
        "all_checks_passed": all_passed,
        "total_checks": len(checks),
        "passed_checks": sum(1 for v in checks.values() if v),
        "checks": checks
    }



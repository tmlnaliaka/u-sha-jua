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

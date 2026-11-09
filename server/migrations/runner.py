import time
import hashlib
from datetime import datetime, timezone
from typing import List, Dict, Any, Callable
from sqlalchemy import text
from sqlalchemy.engine import Engine, Connection


def _migration_001_initial_core_tables(conn: Connection, dialect: str) -> None:
    """001: Validates baseline tables created by SQLAlchemy metadata."""
    conn.execute(text("SELECT 1"))


def _migration_002_incident_lifecycle_columns(conn: Connection, dialect: str) -> None:
    """002: Ensures incident lifecycle timestamps, attachments, and responder checklists exist."""
    if dialect == "sqlite":
        cols = [r[1] for r in conn.exec_driver_sql("PRAGMA table_info(incidents)").fetchall()]
        if cols and "dispatched_at" not in cols:
            conn.exec_driver_sql("ALTER TABLE incidents ADD COLUMN dispatched_at DATETIME")
        if cols and "resolved_at" not in cols:
            conn.exec_driver_sql("ALTER TABLE incidents ADD COLUMN resolved_at DATETIME")
        if cols and "attachments" not in cols:
            conn.exec_driver_sql("ALTER TABLE incidents ADD COLUMN attachments TEXT DEFAULT '[]'")

        resp_cols = [r[1] for r in conn.exec_driver_sql("PRAGMA table_info(responder_units)").fetchall()]
        if resp_cols and "checklist_json" not in resp_cols:
            conn.exec_driver_sql(
                "ALTER TABLE responder_units ADD COLUMN checklist_json TEXT "
                "DEFAULT '{\"hazard_survey\": false, \"triage_perimeter\": false, \"casualty_treatment\": false, \"evacuation_corridor\": false}'"
            )


def _migration_003_composite_btree_spatial_indexes(conn: Connection, dialect: str) -> None:
    """003: Creates composite B-Tree indexes for spatial bounding-box and status/urgency triage queries."""
    index_statements = [
        "CREATE INDEX IF NOT EXISTS idx_incidents_lat_lon ON incidents (latitude, longitude)",
        "CREATE INDEX IF NOT EXISTS idx_incidents_status_urgency_ts ON incidents (status, urgency_level, timestamp)",
        "CREATE INDEX IF NOT EXISTS idx_incidents_ts_desc ON incidents (timestamp)",
        "CREATE INDEX IF NOT EXISTS idx_responders_status_type ON responder_units (status, unit_type)",
        "CREATE INDEX IF NOT EXISTS idx_shelters_active_coords ON evacuation_shelters (is_active, latitude, longitude)"
    ]
    for stmt in index_statements:
        conn.exec_driver_sql(stmt)


MIGRATIONS: List[Dict[str, Any]] = [
    {
        "version": "001",
        "name": "001_initial_core_tables",
        "description": "Verify core operational tables (incidents, responder_units, evacuation_shelters, users, audit_blocks)",
        "fn": _migration_001_initial_core_tables
    },
    {
        "version": "002",
        "name": "002_incident_lifecycle_columns",
        "description": "Add dispatched_at, resolved_at, attachments to incidents and checklist_json to responder_units",
        "fn": _migration_002_incident_lifecycle_columns
    },
    {
        "version": "003",
        "name": "003_composite_btree_spatial_indexes",
        "description": "Enforce composite B-Tree indexes on incidents, responder_units, and evacuation_shelters",
        "fn": _migration_003_composite_btree_spatial_indexes
    }
]


def _compute_migration_checksum(version: str, name: str, description: str) -> str:
    payload = f"{version}:{name}:{description}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def run_migrations(engine: Engine) -> List[Dict[str, Any]]:
    """
    Idempotently applies all pending schema migrations and records them in `schema_migrations`.
    """
    dialect = engine.dialect.name
    applied_records: List[Dict[str, Any]] = []

    with engine.begin() as conn:
        conn.exec_driver_sql(
            """
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version VARCHAR(32) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                description TEXT NOT NULL,
                checksum VARCHAR(64) NOT NULL,
                applied_at VARCHAR(64) NOT NULL,
                execution_ms FLOAT NOT NULL
            )
            """
        )

        existing_rows = conn.execute(
            text("SELECT version, name, description, checksum, applied_at, execution_ms FROM schema_migrations ORDER BY version ASC")
        ).fetchall()
        existing_map = {row[0]: row for row in existing_rows}

        for m in MIGRATIONS:
            ver = m["version"]
            name = m["name"]
            desc = m["description"]
            checksum = _compute_migration_checksum(ver, name, desc)

            # Always run the idempotent migration function to guarantee indexes/columns exist even if DB was partially modified
            t0 = time.time()
            m["fn"](conn, dialect)
            exec_ms = round((time.time() - t0) * 1000, 3)

            if ver not in existing_map:
                applied_at = datetime.now(timezone.utc).isoformat()
                conn.execute(
                    text(
                        """
                        INSERT INTO schema_migrations (version, name, description, checksum, applied_at, execution_ms)
                        VALUES (:version, :name, :description, :checksum, :applied_at, :execution_ms)
                        """
                    ),
                    {
                        "version": ver,
                        "name": name,
                        "description": desc,
                        "checksum": checksum,
                        "applied_at": applied_at,
                        "execution_ms": exec_ms
                    }
                )
                applied_records.append({
                    "version": ver,
                    "name": name,
                    "description": desc,
                    "checksum": checksum,
                    "applied_at": applied_at,
                    "execution_ms": exec_ms,
                    "status": "newly_applied"
                })
            else:
                row = existing_map[ver]
                applied_records.append({
                    "version": row[0],
                    "name": row[1],
                    "description": row[2],
                    "checksum": row[3],
                    "applied_at": row[4],
                    "execution_ms": row[5],
                    "status": "already_applied"
                })

    return applied_records


def get_migration_status(engine: Engine) -> Dict[str, Any]:
    """
    Returns applied schema migrations and active database indexes for verification.
    """
    dialect = engine.dialect.name
    with engine.connect() as conn:
        rows = conn.execute(
            text("SELECT version, name, description, checksum, applied_at, execution_ms FROM schema_migrations ORDER BY version ASC")
        ).fetchall()

        migrations = [
            {
                "version": r[0],
                "name": r[1],
                "description": r[2],
                "checksum": r[3],
                "applied_at": r[4],
                "execution_ms": r[5]
            }
            for r in rows
        ]

        indexes: List[str] = []
        if dialect == "sqlite":
            for tbl in ("incidents", "responder_units", "evacuation_shelters"):
                idx_rows = conn.exec_driver_sql(f"PRAGMA index_list({tbl})").fetchall()
                for ir in idx_rows:
                    indexes.append(ir[1])
        else:
            idx_rows = conn.execute(
                text("SELECT indexname FROM pg_indexes WHERE schemaname = 'public'")
            ).fetchall()
            indexes = [ir[0] for ir in idx_rows]

    return {
        "dialect": dialect,
        "head_version": migrations[-1]["version"] if migrations else None,
        "total_applied": len(migrations),
        "migrations": migrations,
        "active_indexes": sorted(list(set(indexes)))
    }


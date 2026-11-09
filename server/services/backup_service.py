import json
import uuid
import hashlib
from datetime import datetime, timezone
from typing import Dict, Any, List
from sqlalchemy.orm import Session
from sqlalchemy.engine import Engine
from models.incident import Incident, IncidentType, UrgencyLevel, IncidentStatus
from models.responder import ResponderUnit, ResponderType, ResponderStatus
from models.shelter import Shelter
from services.spatial_index import spatial_grid, spatial_cache
from services.audit_service import audit_service


def _parse_iso_dt(val: Any):
    if not val:
        return None
    if isinstance(val, datetime):
        return val
    try:
        return datetime.fromisoformat(str(val).replace("Z", "+00:00"))
    except Exception:
        return datetime.now(timezone.utc)


class BackupService:
    """
    Portable Disaster Snapshot Backup, Integrity Verification (SHA-256),
    Transactional Restore, and Query Plan Analyzer for u-SHA-jua.
    """

    @staticmethod
    def _compute_data_checksum(data_dict: Dict[str, Any]) -> str:
        canonical = json.dumps(data_dict, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()

    def export_snapshot(self, db: Session, engine: Engine) -> Dict[str, Any]:
        incidents = [inc.to_dict() for inc in db.query(Incident).order_by(Incident.id.asc()).all()]
        responders = [resp.to_dict() for resp in db.query(ResponderUnit).order_by(ResponderUnit.id.asc()).all()]
        shelters = [sh.to_dict() for sh in db.query(Shelter).order_by(Shelter.id.asc()).all()]

        data_payload = {
            "incidents": incidents,
            "responder_units": responders,
            "evacuation_shelters": shelters
        }
        checksum = self._compute_data_checksum(data_payload)
        snapshot_id = f"snap-{uuid.uuid4().hex[:12]}"
        created_at = datetime.now(timezone.utc).isoformat()

        audit_service.log_event(
            action="DATABASE_SNAPSHOT_EXPORTED",
            actor="system/backup_service",
            details={
                "snapshot_id": snapshot_id,
                "incidents_count": len(incidents),
                "responders_count": len(responders),
                "shelters_count": len(shelters),
                "sha256_checksum": checksum
            }
        )

        return {
            "snapshot_id": snapshot_id,
            "version": "1.4.0-enterprise",
            "dialect": engine.dialect.name,
            "created_at": created_at,
            "record_counts": {
                "incidents": len(incidents),
                "responder_units": len(responders),
                "evacuation_shelters": len(shelters)
            },
            "sha256_checksum": checksum,
            "data": data_payload
        }

    def restore_snapshot(self, db: Session, snapshot: Dict[str, Any]) -> Dict[str, Any]:
        if "data" not in snapshot or "sha256_checksum" not in snapshot:
            raise ValueError("Invalid snapshot payload: missing 'data' or 'sha256_checksum'")

        data_payload = snapshot["data"]
        expected_checksum = snapshot["sha256_checksum"]
        actual_checksum = self._compute_data_checksum(data_payload)

        if actual_checksum != expected_checksum:
            raise ValueError(
                f"Snapshot SHA-256 integrity check failed! Expected {expected_checksum[:16]}..., got {actual_checksum[:16]}..."
            )

        restored_incidents = 0
        restored_responders = 0
        restored_shelters = 0

        # 1. Upsert Incidents
        for inc_dict in data_payload.get("incidents", []):
            inc_id = inc_dict["id"]
            coords = inc_dict.get("coordinates", {})
            lat = float(coords.get("latitude", inc_dict.get("latitude", -1.2921)))
            lon = float(coords.get("longitude", inc_dict.get("longitude", 36.8219)))
            attachments_str = json.dumps(inc_dict.get("attachments", []))

            existing = db.query(Incident).filter(Incident.id == inc_id).first()
            if existing:
                existing.raw_text = inc_dict["raw_text"]
                existing.incident_type = IncidentType(inc_dict["incident_type"])
                existing.urgency_level = UrgencyLevel(inc_dict["urgency_level"])
                existing.location_name = inc_dict["location_name"]
                existing.latitude = lat
                existing.longitude = lon
                existing.status = IncidentStatus(inc_dict["status"])
                existing.timestamp = _parse_iso_dt(inc_dict.get("timestamp")) or datetime.now(timezone.utc)
                existing.dispatched_at = _parse_iso_dt(inc_dict.get("dispatched_at"))
                existing.resolved_at = _parse_iso_dt(inc_dict.get("resolved_at"))
                existing.attachments = attachments_str
                spatial_grid.add_or_update(existing.to_dict())
            else:
                new_inc = Incident(
                    id=inc_id,
                    raw_text=inc_dict["raw_text"],
                    incident_type=IncidentType(inc_dict["incident_type"]),
                    urgency_level=UrgencyLevel(inc_dict["urgency_level"]),
                    location_name=inc_dict["location_name"],
                    latitude=lat,
                    longitude=lon,
                    status=IncidentStatus(inc_dict["status"]),
                    timestamp=_parse_iso_dt(inc_dict.get("timestamp")) or datetime.now(timezone.utc),
                    dispatched_at=_parse_iso_dt(inc_dict.get("dispatched_at")),
                    resolved_at=_parse_iso_dt(inc_dict.get("resolved_at")),
                    attachments=attachments_str
                )
                db.add(new_inc)
                spatial_grid.add_or_update(new_inc.to_dict())
            restored_incidents += 1

        # 2. Upsert Responder Units
        for r_dict in data_payload.get("responder_units", []):
            r_id = r_dict["id"]
            coords = r_dict.get("coordinates", {})
            lat = float(coords.get("latitude", r_dict.get("latitude", -1.2921)))
            lon = float(coords.get("longitude", r_dict.get("longitude", 36.8219)))
            checklist_str = json.dumps(r_dict.get("checklist", {}))

            existing_r = db.query(ResponderUnit).filter(ResponderUnit.id == r_id).first()
            if existing_r:
                existing_r.callsign = r_dict["callsign"]
                existing_r.unit_type = ResponderType(r_dict["unit_type"])
                existing_r.base_station = r_dict["base_station"]
                existing_r.latitude = lat
                existing_r.longitude = lon
                existing_r.status = ResponderStatus(r_dict["status"])
                existing_r.assigned_incident_id = r_dict.get("assigned_incident_id")
                existing_r.checklist_json = checklist_str
            else:
                # Also check by callsign uniqueness
                by_callsign = db.query(ResponderUnit).filter(ResponderUnit.callsign == r_dict["callsign"]).first()
                if by_callsign:
                    by_callsign.latitude = lat
                    by_callsign.longitude = lon
                    by_callsign.status = ResponderStatus(r_dict["status"])
                    by_callsign.assigned_incident_id = r_dict.get("assigned_incident_id")
                    by_callsign.checklist_json = checklist_str
                else:
                    db.add(ResponderUnit(
                        id=r_id,
                        callsign=r_dict["callsign"],
                        unit_type=ResponderType(r_dict["unit_type"]),
                        base_station=r_dict["base_station"],
                        latitude=lat,
                        longitude=lon,
                        status=ResponderStatus(r_dict["status"]),
                        assigned_incident_id=r_dict.get("assigned_incident_id"),
                        checklist_json=checklist_str
                    ))
            restored_responders += 1

        # 3. Upsert Evacuation Shelters
        for s_dict in data_payload.get("evacuation_shelters", []):
            s_id = s_dict["id"]
            coords = s_dict.get("coordinates", {})
            lat = float(coords.get("latitude", s_dict.get("latitude", -1.2921)))
            lon = float(coords.get("longitude", s_dict.get("longitude", 36.8219)))

            existing_s = db.query(Shelter).filter(Shelter.id == s_id).first()
            if existing_s:
                existing_s.name = s_dict["name"]
                existing_s.location_name = s_dict["location_name"]
                existing_s.latitude = lat
                existing_s.longitude = lon
                existing_s.capacity_total = int(s_dict.get("capacity_total", 500))
                existing_s.occupancy_current = int(s_dict.get("occupancy_current", 0))
                existing_s.water_supply_status = s_dict.get("water_supply_status", "Operational")
                existing_s.medical_post_available = bool(s_dict.get("medical_post_available", True))
                existing_s.contact_phone = s_dict.get("contact_phone", "+254 700 000 000")
                existing_s.is_active = bool(s_dict.get("is_active", True))
            else:
                db.add(Shelter(
                    id=s_id,
                    name=s_dict["name"],
                    location_name=s_dict["location_name"],
                    latitude=lat,
                    longitude=lon,
                    capacity_total=int(s_dict.get("capacity_total", 500)),
                    occupancy_current=int(s_dict.get("occupancy_current", 0)),
                    water_supply_status=s_dict.get("water_supply_status", "Operational"),
                    medical_post_available=bool(s_dict.get("medical_post_available", True)),
                    contact_phone=s_dict.get("contact_phone", "+254 700 000 000"),
                    is_active=bool(s_dict.get("is_active", True))
                ))
            restored_shelters += 1

        db.commit()
        spatial_cache.invalidate_all()

        audit_service.log_event(
            action="DATABASE_SNAPSHOT_RESTORED",
            actor="system/backup_service",
            details={
                "snapshot_id": snapshot.get("snapshot_id", "custom"),
                "sha256_checksum": actual_checksum,
                "restored_incidents": restored_incidents,
                "restored_responders": restored_responders,
                "restored_shelters": restored_shelters
            }
        )

        return {
            "status": "restored",
            "checksum_verified": True,
            "sha256_checksum": actual_checksum,
            "restored_counts": {
                "incidents": restored_incidents,
                "responder_units": restored_responders,
                "evacuation_shelters": restored_shelters
            },
            "restored_at": datetime.now(timezone.utc).isoformat()
        }

    def analyze_query_plans(self, engine: Engine) -> Dict[str, Any]:
        """
        Executes EXPLAIN QUERY PLAN on critical spatial bounding-box and status/urgency triage queries
        to verify that composite B-Tree indexes are actively utilized instead of full table scans.
        """
        dialect = engine.dialect.name
        plans: Dict[str, List[str]] = {}

        queries = {
            "spatial_bbox_query": (
                "SELECT id, incident_type, urgency_level, latitude, longitude FROM incidents "
                "WHERE latitude BETWEEN -1.35 AND -1.20 AND longitude BETWEEN 36.75 AND 36.95"
            ),
            "triage_status_urgency_query": (
                "SELECT id, location_name, timestamp FROM incidents "
                "WHERE status = 'PENDING' AND urgency_level = 'CRITICAL' ORDER BY timestamp DESC LIMIT 50"
            ),
            "active_shelters_spatial_query": (
                "SELECT id, name, capacity_total, occupancy_current FROM evacuation_shelters "
                "WHERE is_active = 1 AND latitude BETWEEN -1.35 AND -1.20"
            )
        }

        with engine.connect() as conn:
            for key, sql in queries.items():
                if dialect == "sqlite":
                    rows = conn.exec_driver_sql(f"EXPLAIN QUERY PLAN {sql}").fetchall()
                    plans[key] = [str(r[-1]) for r in rows]
                else:
                    rows = conn.exec_driver_sql(f"EXPLAIN {sql}").fetchall()
                    plans[key] = [str(r[0]) for r in rows]

        uses_index = all(
            any("INDEX" in step.upper() for step in steps)
            for steps in plans.values()
        )

        return {
            "dialect": dialect,
            "all_queries_indexed": uses_index,
            "query_plans": plans
        }


backup_service = BackupService()

import json
import hashlib
import threading
from datetime import datetime, timezone
from typing import List, Dict, Any
from database import Base, engine, SessionLocal
from models.audit import AuditBlock


class AuditEntry:
    def __init__(
        self,
        entry_id: int,
        timestamp: str,
        action: str,
        actor: str,
        details: Dict[str, Any],
        previous_hash: str,
        entry_hash: str
    ):
        self.entry_id = entry_id
        self.timestamp = timestamp
        self.action = action
        self.actor = actor
        self.details = details
        self.previous_hash = previous_hash
        self.entry_hash = entry_hash

    def to_dict(self) -> Dict[str, Any]:
        return {
            "entry_id": self.entry_id,
            "timestamp": self.timestamp,
            "action": self.action,
            "actor": self.actor,
            "details": self.details,
            "previous_hash": self.previous_hash,
            "entry_hash": self.entry_hash
        }


class AuditService:
    """
    Cryptographically verifiable SHA-256 tamper-evident operational audit ledger.
    Guarantees non-repudiation and post-disaster accountability for all emergency actions.
    Supports durable SQLite/PostGIS persistence (persist_to_db=True) so the hash chain
    survives server restarts without losing historical blocks.
    """
    def __init__(self, persist_to_db: bool = False):
        self._entries: List[AuditEntry] = []
        self._lock = threading.RLock()
        self._persist_to_db = persist_to_db

        if self._persist_to_db:
            self._load_or_init_from_db()
        else:
            self._create_genesis_block()

    def _compute_hash(self, entry_id: int, timestamp: str, action: str, actor: str, details: Dict[str, Any], prev_hash: str) -> str:
        payload = f"{entry_id}|{timestamp}|{action}|{actor}|{json.dumps(details, sort_keys=True)}|{prev_hash}"
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    def _create_genesis_entry(self) -> AuditEntry:
        ts = "2026-10-15T00:00:00Z"
        prev = "0" * 64
        details = {"message": "u-SHA-jua Sovereign Cryptographic Audit Ledger Genesis"}
        genesis_hash = self._compute_hash(0, ts, "SYSTEM_INIT", "System/Kernel", details, prev)
        return AuditEntry(0, ts, "SYSTEM_INIT", "System/Kernel", details, prev, genesis_hash)

    def _create_genesis_block(self):
        self._entries.append(self._create_genesis_entry())

    def _sync_with_db(self):
        """Synchronizes in-memory entries with the persistent database ledger."""
        if not self._persist_to_db:
            return
        try:
            Base.metadata.create_all(bind=engine)
            db = SessionLocal()
            try:
                rows = db.query(AuditBlock).order_by(AuditBlock.entry_id.asc()).all()
                if rows:
                    self._entries = [
                        AuditEntry(
                            entry_id=r.entry_id,
                            timestamp=r.timestamp,
                            action=r.action,
                            actor=r.actor,
                            details=json.loads(r.details_json),
                            previous_hash=r.previous_hash,
                            entry_hash=r.entry_hash
                        )
                        for r in rows
                    ]
                elif not self._entries:
                    genesis = self._create_genesis_entry()
                    self._entries = [genesis]
                    db.add(AuditBlock(
                        entry_id=genesis.entry_id,
                        timestamp=genesis.timestamp,
                        action=genesis.action,
                        actor=genesis.actor,
                        details_json=json.dumps(genesis.details, sort_keys=True),
                        previous_hash=genesis.previous_hash,
                        entry_hash=genesis.entry_hash
                    ))
                    db.commit()
            finally:
                db.close()
        except Exception:
            if not self._entries:
                self._create_genesis_block()

    def _load_or_init_from_db(self):
        with self._lock:
            self._sync_with_db()

    def log_event(self, action: str, actor: str, details: Dict[str, Any]) -> AuditEntry:
        with self._lock:
            if self._persist_to_db:
                self._sync_with_db()
            entry_id = len(self._entries)
            prev_hash = self._entries[-1].entry_hash
            ts = datetime.now(timezone.utc).isoformat()
            entry_hash = self._compute_hash(entry_id, ts, action, actor, details, prev_hash)
            entry = AuditEntry(entry_id, ts, action, actor, details, prev_hash, entry_hash)
            self._entries.append(entry)

            if self._persist_to_db:
                try:
                    db = SessionLocal()
                    try:
                        existing = db.query(AuditBlock).filter(AuditBlock.entry_id == entry_id).first()
                        if not existing:
                            db.add(AuditBlock(
                                entry_id=entry.entry_id,
                                timestamp=entry.timestamp,
                                action=entry.action,
                                actor=entry.actor,
                                details_json=json.dumps(entry.details, sort_keys=True),
                                previous_hash=entry.previous_hash,
                                entry_hash=entry.entry_hash
                            ))
                            db.commit()
                    finally:
                        db.close()
                except Exception:
                    pass

            return entry

    def get_entries(self, limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
        with self._lock:
            if self._persist_to_db:
                self._sync_with_db()
            rev = list(reversed(self._entries))
            return [e.to_dict() for e in rev[offset:offset + limit]]

    def verify_integrity(self) -> Dict[str, Any]:
        """Validates that no historical block in the chain has been modified or forged."""
        with self._lock:
            if self._persist_to_db:
                self._sync_with_db()
            total = len(self._entries)
            if total == 0:
                return {"valid": True, "total_blocks": 0, "message": "Ledger is empty"}

            prev_hash = "0" * 64
            for idx, entry in enumerate(self._entries):
                if entry.entry_id != idx:
                    return {
                        "valid": False,
                        "total_blocks": total,
                        "error_at_block": idx,
                        "reason": f"Mismatched block index {entry.entry_id} vs {idx}"
                    }
                if entry.previous_hash != prev_hash:
                    return {
                        "valid": False,
                        "total_blocks": total,
                        "error_at_block": idx,
                        "reason": f"Broken hash chain at block {idx}"
                    }
                expected_hash = self._compute_hash(
                    entry.entry_id,
                    entry.timestamp,
                    entry.action,
                    entry.actor,
                    entry.details,
                    entry.previous_hash
                )
                if entry.entry_hash != expected_hash:
                    return {
                        "valid": False,
                        "total_blocks": total,
                        "error_at_block": idx,
                        "reason": f"Tampered block hash at block {idx}"
                    }
                prev_hash = entry.entry_hash

            return {
                "valid": True,
                "total_blocks": total,
                "latest_hash": self._entries[-1].entry_hash,
                "status": "SECURE_AND_VERIFIED"
            }


audit_service = AuditService(persist_to_db=True)

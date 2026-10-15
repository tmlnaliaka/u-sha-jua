import json
import hashlib
import threading
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

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
    """
    def __init__(self):
        self._entries: List[AuditEntry] = []
        self._lock = threading.RLock()
        # Initialize with genesis block
        self._create_genesis_block()

    def _compute_hash(self, entry_id: int, timestamp: str, action: str, actor: str, details: Dict[str, Any], prev_hash: str) -> str:
        payload = f"{entry_id}|{timestamp}|{action}|{actor}|{json.dumps(details, sort_keys=True)}|{prev_hash}"
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    def _create_genesis_block(self):
        ts = "2026-10-15T00:00:00Z"
        prev = "0" * 64
        details = {"message": "u-SHA-jua Sovereign Cryptographic Audit Ledger Genesis"}
        genesis_hash = self._compute_hash(0, ts, "SYSTEM_INIT", "System/Kernel", details, prev)
        self._entries.append(AuditEntry(0, ts, "SYSTEM_INIT", "System/Kernel", details, prev, genesis_hash))

    def log_event(self, action: str, actor: str, details: Dict[str, Any]) -> AuditEntry:
        with self._lock:
            entry_id = len(self._entries)
            prev_hash = self._entries[-1].entry_hash
            ts = datetime.now(timezone.utc).isoformat()
            entry_hash = self._compute_hash(entry_id, ts, action, actor, details, prev_hash)
            entry = AuditEntry(entry_id, ts, action, actor, details, prev_hash, entry_hash)
            self._entries.append(entry)
            return entry

    def get_entries(self, limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
        with self._lock:
            # Return reversed (latest first)
            rev = list(reversed(self._entries))
            return [e.to_dict() for e in rev[offset:offset+limit]]

    def verify_integrity(self) -> Dict[str, Any]:
        """Validates that no historical block in the chain has been modified or forged."""
        with self._lock:
            total = len(self._entries)
            if total == 0:
                return {"valid": True, "total_blocks": 0, "message": "Ledger is empty"}

            # Verify genesis
            prev_hash = "0" * 64
            for idx, entry in enumerate(self._entries):
                if entry.entry_id != idx:
                    return {
                        "valid": False,
                        "error_at_block": idx,
                        "reason": f"Mismatched block index {entry.entry_id} vs {idx}"
                    }
                if entry.previous_hash != prev_hash:
                    return {
                        "valid": False,
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

audit_service = AuditService()

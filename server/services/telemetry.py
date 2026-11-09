import time
import json
import uuid
import logging
from collections import deque
from datetime import datetime, timezone
from typing import Dict, List, Any, Optional
from services.spatial_index import spatial_grid, spatial_cache
from services.websocket_manager import ws_manager
from services.audit_service import audit_service

logger = logging.getLogger("ushajua.telemetry")


class TelemetryCollector:
    """
    Real-time observability, structured JSON request logger, and metrics aggregator
    for the u-SHA-jua Crisis Informatics Platform.
    """

    def __init__(self):
        self.start_time = time.time()
        self.total_requests: int = 0
        self.total_errors_4xx: int = 0
        self.total_errors_5xx: int = 0
        self.rate_limited_429: int = 0
        self.client_crash_count: int = 0
        self._latencies: deque = deque(maxlen=500)
        self._route_counts: Dict[str, int] = {}
        self._recent_logs: deque = deque(maxlen=100)
        self._client_crashes: deque = deque(maxlen=50)

    def record_request(
        self,
        method: str,
        path: str,
        status_code: int,
        duration_ms: float,
        request_id: str,
        client_ip: str = "127.0.0.1"
    ) -> Dict[str, Any]:
        self.total_requests += 1
        if status_code == 429:
            self.rate_limited_429 += 1
        if 400 <= status_code < 500:
            self.total_errors_4xx += 1
        elif status_code >= 500:
            self.total_errors_5xx += 1

        self._latencies.append(round(duration_ms, 3))
        route_key = f"{method} {path}"
        self._route_counts[route_key] = self._route_counts.get(route_key, 0) + 1

        level = "ERROR" if status_code >= 500 else ("WARNING" if status_code >= 400 else "INFO")
        log_record = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": level,
            "service": "ushajua-api",
            "request_id": request_id,
            "method": method,
            "path": path,
            "status_code": status_code,
            "duration_ms": round(duration_ms, 2),
            "client_ip": client_ip
        }
        self._recent_logs.appendleft(log_record)
        return log_record

    def record_client_crash(self, payload: Dict[str, Any], client_ip: str = "127.0.0.1") -> Dict[str, Any]:
        self.client_crash_count += 1
        crash_id = f"crash-{uuid.uuid4().hex[:12]}"
        now_iso = datetime.now(timezone.utc).isoformat()

        crash_entry = {
            "crash_id": crash_id,
            "received_at": now_iso,
            "client_timestamp": payload.get("timestamp") or now_iso,
            "message": str(payload.get("message", "Unknown client error"))[:500],
            "stack": str(payload.get("stack", ""))[:2000],
            "component_stack": str(payload.get("componentStack", ""))[:2000],
            "url": str(payload.get("url", ""))[:500],
            "user_agent": str(payload.get("userAgent", ""))[:500],
            "client_ip": client_ip
        }
        self._client_crashes.appendleft(crash_entry)

        # Log into cryptographic audit ledger
        audit_service.log_event(
            action="CLIENT_CRASH_REPORTED",
            actor="react_error_boundary",
            details={"crash_id": crash_id, "message": crash_entry["message"], "url": crash_entry["url"]}
        )

        # Also add structured log entry
        self._recent_logs.appendleft({
            "timestamp": now_iso,
            "level": "ERROR",
            "service": "ushajua-client",
            "request_id": crash_id,
            "method": "CLIENT_ERROR",
            "path": crash_entry["url"] or "/",
            "status_code": 599,
            "duration_ms": 0.0,
            "client_ip": client_ip,
            "error_message": crash_entry["message"]
        })

        return crash_entry

    def get_metrics(self) -> Dict[str, Any]:
        latencies = list(self._latencies)
        if latencies:
            sorted_lat = sorted(latencies)
            avg_lat = round(sum(sorted_lat) / len(sorted_lat), 2)
            p95_idx = min(len(sorted_lat) - 1, int(len(sorted_lat) * 0.95))
            p95_lat = round(sorted_lat[p95_idx], 2)
            max_lat = round(sorted_lat[-1], 2)
        else:
            avg_lat = 0.0
            p95_lat = 0.0
            max_lat = 0.0

        top_routes = sorted(
            [{"route": k, "count": v} for k, v in self._route_counts.items()],
            key=lambda x: x["count"],
            reverse=True
        )[:10]

        return {
            "status": "operational",
            "uptime_seconds": round(time.time() - self.start_time, 2),
            "requests": {
                "total": self.total_requests,
                "errors_4xx": self.total_errors_4xx,
                "errors_5xx": self.total_errors_5xx,
                "rate_limited_429": self.rate_limited_429,
                "client_crashes": self.client_crash_count
            },
            "latency_ms": {
                "avg": avg_lat,
                "p95": p95_lat,
                "max": max_lat,
                "sample_size": len(latencies)
            },
            "subsystems": {
                "spatial_grid_items": spatial_grid.size(),
                "spatial_cache_hits": spatial_cache.hits,
                "spatial_cache_misses": spatial_cache.misses,
                "active_ws_connections": ws_manager.active_count,
                "audit_ledger_blocks": audit_service.verify_integrity().get("total_blocks", 0)
            },
            "top_routes": top_routes,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }

    def get_recent_logs(self, limit: int = 50) -> List[Dict[str, Any]]:
        return list(self._recent_logs)[:limit]

    def get_client_crashes(self, limit: int = 25) -> List[Dict[str, Any]]:
        return list(self._client_crashes)[:limit]


telemetry_collector = TelemetryCollector()

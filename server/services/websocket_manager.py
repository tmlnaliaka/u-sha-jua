import json
import asyncio
import logging
from typing import Dict, Set, Optional, Any
from fastapi import WebSocket

logger = logging.getLogger("websocket_manager")

class ClientSubscription:
    def __init__(self, websocket: WebSocket):
        self.websocket = websocket
        self.channels: Set[str] = {"all"}  # "all", "critical", "dispatched", etc.
        self.bbox: Optional[Dict[str, float]] = None  # Viewport filtering

class WebSocketManager:
    """
    High-concurrency Asynchronous WebSocket Telemetry Hub.
    - Concurrent parallel broadcasting via asyncio.gather (eliminates head-of-line blocking)
    - Per-socket send timeout & dead connection cleanup
    - Topic and spatial viewport channel subscription filtering
    - Real-time connection metrics
    """
    def __init__(self):
        self._connections: Dict[WebSocket, ClientSubscription] = {}
        self._lock = asyncio.Lock()
        self.total_broadcasts: int = 0
        self.dropped_connections: int = 0

    @property
    def active_count(self) -> int:
        return len(self._connections)

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._connections[websocket] = ClientSubscription(websocket)
        logger.info(f"WebSocket client connected. Active: {len(self._connections)}")

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            if websocket in self._connections:
                del self._connections[websocket]
                self.dropped_connections += 1
        logger.info(f"WebSocket client disconnected. Active: {len(self._connections)}")

    def update_subscription(
        self,
        websocket: WebSocket,
        channels: Optional[Set[str]] = None,
        bbox: Optional[Dict[str, float]] = None
    ) -> None:
        if websocket in self._connections:
            sub = self._connections[websocket]
            if channels is not None:
                sub.channels = channels
            if bbox is not None:
                sub.bbox = bbox

    def _should_receive(self, sub: ClientSubscription, event_type: str, payload: dict) -> bool:
        if "all" in sub.channels:
            pass  # Matches baseline
        elif "critical" in sub.channels:
            urgency = payload.get("urgency_level")
            if urgency != "Critical":
                return False

        # Viewport check if client configured a bounding box
        if sub.bbox and "coordinates" in payload:
            coords = payload["coordinates"]
            lat = coords.get("latitude")
            lon = coords.get("longitude")
            if lat is not None and lon is not None:
                b = sub.bbox
                if not (b["min_lat"] <= lat <= b["max_lat"] and b["min_lon"] <= lon <= b["max_lon"]):
                    return False

        return True

    async def broadcast(self, event_type: str, payload: dict) -> None:
        """
        Broadcasting routine sending concurrently to all eligible clients.
        Slow clients that fail or exceed 1.5s timeout are cleanly pruned.
        """
        async with self._lock:
            subs = list(self._connections.values())

        if not subs:
            return

        message = json.dumps({"event": event_type, "data": payload})
        self.total_broadcasts += 1

        async def _safe_send(sub: ClientSubscription) -> Optional[WebSocket]:
            if not self._should_receive(sub, event_type, payload):
                return None
            try:
                await asyncio.wait_for(sub.websocket.send_text(message), timeout=1.5)
                return None
            except Exception:
                return sub.websocket

        # Concurrent parallel broadcast
        results = await asyncio.gather(*[_safe_send(s) for s in subs], return_exceptions=True)

        dead_sockets = [res for res in results if isinstance(res, WebSocket)]
        if dead_sockets:
            async with self._lock:
                for dead_ws in dead_sockets:
                    if dead_ws in self._connections:
                        del self._connections[dead_ws]
                        self.dropped_connections += 1

    def get_metrics(self) -> Dict[str, Any]:
        return {
            "active_connections": len(self._connections),
            "total_broadcasts": self.total_broadcasts,
            "dropped_connections": self.dropped_connections
        }

ws_manager = WebSocketManager()

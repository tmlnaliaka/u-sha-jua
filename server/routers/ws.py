import json
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from services.websocket_manager import ws_manager

logger = logging.getLogger("ws")
router = APIRouter(tags=["WebSockets"])

@router.websocket("/ws/live-incidents")
async def websocket_live_incidents(websocket: WebSocket):
    """
    Asynchronous WebSocket pipeline pushing real-time incident notifications
    and telemetry to connected command centers and first responder units.
    Supports low-bandwidth channel subscriptions and viewport filtering.
    """
    await ws_manager.connect(websocket)
    try:
        # Send initial confirmation handshake with active metrics
        await websocket.send_json({
            "event": "connection_established",
            "message": "Connected to u-SHA-jua Scaled Telemetry Socket",
            "active_clients": ws_manager.active_count
        })
        while True:
            raw_data = await websocket.receive_text()
            if raw_data == "ping":
                await websocket.send_text("pong")
                continue

            try:
                payload = json.loads(raw_data)
                action = payload.get("action")

                if action == "subscribe":
                    channels = set(payload.get("channels", ["all"]))
                    ws_manager.update_subscription(websocket, channels=channels)
                    await websocket.send_json({"event": "subscribed", "channels": list(channels)})

                elif action == "set_viewport":
                    bbox = payload.get("bbox")
                    ws_manager.update_subscription(websocket, bbox=bbox)
                    await websocket.send_json({"event": "viewport_updated", "bbox": bbox})

                elif action == "get_metrics":
                    await websocket.send_json({"event": "metrics", "data": ws_manager.get_metrics()})

            except json.JSONDecodeError:
                # Raw text ignore or ping
                pass

    except WebSocketDisconnect:
        await ws_manager.disconnect(websocket)
    except Exception as e:
        logger.warning(f"WebSocket client error: {e}")
        await ws_manager.disconnect(websocket)

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from services.websocket_manager import ws_manager
import logging

logger = logging.getLogger("ws")
router = APIRouter(tags=["WebSockets"])

@router.websocket("/ws/live-incidents")
async def websocket_live_incidents(websocket: WebSocket):
    """
    Asynchronous WebSocket pipeline pushing real-time incident notifications
    and telemetry to connected command centers and first responder units.
    """
    await ws_manager.connect(websocket)
    try:
        # Send initial confirmation handshake
        await websocket.send_json({
            "event": "connection_established",
            "message": "Connected to u-SHA-jua Live Telemetry Socket"
        })
        while True:
            # Keep socket alive and accept ping/pong or client acknowledgments
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception as e:
        logger.warning(f"WebSocket error: {e}")
        ws_manager.disconnect(websocket)

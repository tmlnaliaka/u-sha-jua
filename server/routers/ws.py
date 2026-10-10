import asyncio
import logging
import time

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from database import SessionLocal
from models.user import User
from services.auth_service import decode_access_token
from services.websocket_manager import ws_manager

logger = logging.getLogger("ws")
router = APIRouter(tags=["WebSockets"])

@router.websocket("/ws/live-incidents")
async def websocket_live_incidents(websocket: WebSocket):
    """
    Asynchronous WebSocket pipeline pushing real-time incident notifications
    and telemetry to connected command centers and first responder units.
    """
    await websocket.accept()
    connected = False
    try:
        auth_message = await asyncio.wait_for(websocket.receive_json(), timeout=10)
        if not isinstance(auth_message, dict) or auth_message.get("type") != "auth":
            await websocket.close(code=4401, reason="Authentication required")
            return

        payload = decode_access_token(str(auth_message.get("token", "")))
        db: Session = SessionLocal()
        try:
            user = db.query(User).filter(User.id == payload["sub"], User.is_active.is_(True)).first()
            if user is None or user.role != "admin":
                await websocket.close(code=4403, reason="Administrator access required")
                return
        finally:
            db.close()

        await ws_manager.connect(websocket)
        connected = True
        expires_at = int(payload["exp"])
        await websocket.send_json({
            "event": "connection_established",
            "message": "Connected to u-SHA-jua Live Telemetry Socket"
        })
        while True:
            remaining = expires_at - int(time.time())
            if remaining <= 0:
                await websocket.close(code=4401, reason="Session expired")
                ws_manager.disconnect(websocket)
                connected = False
                break
            data = await asyncio.wait_for(websocket.receive_text(), timeout=remaining)
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        if connected:
            ws_manager.disconnect(websocket)
    except HTTPException as exc:
        await websocket.close(code=1011 if exc.status_code == 503 else 4401, reason="Authentication failed")
    except asyncio.TimeoutError:
        if connected:
            ws_manager.disconnect(websocket)
        await websocket.close(code=4401, reason="Session expired")
    except (ValueError, TypeError, KeyError):
        await websocket.close(code=4401, reason="Authentication failed")
    except Exception as e:
        logger.warning(f"WebSocket error: {e}")
        if connected:
            ws_manager.disconnect(websocket)

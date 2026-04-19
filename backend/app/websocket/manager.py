"""
WebSocket connection manager with delta filtering.
Maintains active connections and broadcasts updates intelligently.
"""

import json
import logging
import asyncio
from datetime import datetime, timezone
from fastapi import WebSocket

logger = logging.getLogger(__name__)

class ConnectionManager:
    """
    Manages all active WebSocket connections.
    Implements delta filtering to avoid redundant broadcasts.
    """
    
    def __init__(self) -> None:
        self.active_connections: set[WebSocket] = set()
        self._last_zone_states: dict[str, dict] = {}
        self.lock = asyncio.Lock()
    
    async def connect(self, websocket: WebSocket) -> None:
        """Accepts connection and adds to active set."""
        await websocket.accept()
        async with self.lock:
            self.active_connections.add(websocket)
        logger.info(f"WebSocket connected. Total: {len(self.active_connections)}")
    
    async def disconnect(self, websocket: WebSocket) -> None:
        """Removes connection from active set."""
        async with self.lock:
            self.active_connections.discard(websocket)
        logger.info(f"WebSocket disconnected. Total: {len(self.active_connections)}")
    
    async def send_snapshot(self, websocket: WebSocket, snapshot: dict) -> None:
        """Sends full state snapshot to a single newly-connected client."""
        try:
            await websocket.send_text(json.dumps({
                "type": "snapshot",
                "data": snapshot,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }, default=str))
        except Exception as e:
            logger.error(f"Snapshot send failed: {e}")
            await self.disconnect(websocket)
    
    def _should_broadcast_zone(self, zone_id: str, new_state: dict) -> bool:
        """
        Delta filter: only broadcast if occupancy changed >=2%
        or risk level changed. Prevents UI jitter from tiny fluctuations.
        """
        if zone_id not in self._last_zone_states:
            return True
        prev = self._last_zone_states[zone_id]
        pct_delta = abs(
            new_state.get("occupancy_pct", 0) - prev.get("occupancy_pct", 0)
        )
        risk_changed = new_state.get("risk_level") != prev.get("risk_level")
        return pct_delta >= 2.0 or risk_changed
    
    async def broadcast_zone_update(self, zones: list[dict]) -> None:
        """
        Broadcasts zone updates to all connected clients.
        Only sends zones that passed the delta filter.
        """
        filtered_zones = [
            z for z in zones 
            if self._should_broadcast_zone(z["zone_id"], z)
        ]
        
        if not filtered_zones:
            return
        
        for zone in filtered_zones:
            self._last_zone_states[zone["zone_id"]] = zone
        
        message = json.dumps({
            "type": "zone_update",
            "data": filtered_zones,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }, default=str)
        
        await self._broadcast(message)
    
    async def broadcast_pipeline_update(self, pipeline: dict) -> None:
        """Broadcasts new pipeline output to all connected clients."""
        # Clean down heavy outputs before broadcasting to UI
        optimized_pipeline = {
            "run_id": pipeline.get("run_id"),
            "hotspots": pipeline.get("hotspots", []),
            "cascade_zones": pipeline.get("cascade_zones", []),
            "decisions": pipeline.get("decisions", []),
            "communication": pipeline.get("communication", {}),
            "confidence_overall": pipeline.get("confidence_overall", 0),
        }
        message = json.dumps({
            "type": "pipeline_update",
            "data": optimized_pipeline,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }, default=str)
        await self._broadcast(message)
    
    async def broadcast_alert(self, alert: dict) -> None:
        """Broadcasts new alert immediately to all connected clients."""
        message = json.dumps({
            "type": "alert",
            "data": alert,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }, default=str)
        await self._broadcast(message)
    
    async def _broadcast(self, message: str) -> None:
        """Sends message to all active connections, removes dead ones."""
        dead_connections = set()
        
        async with self.lock:
            for websocket in self.active_connections:
                try:
                    await websocket.send_text(message)
                except Exception:
                    dead_connections.add(websocket)
                    
            for dead in dead_connections:
                self.active_connections.discard(dead)
                
        if dead_connections:
            logger.warning(f"Removed {len(dead_connections)} dead connections")

manager = ConnectionManager()

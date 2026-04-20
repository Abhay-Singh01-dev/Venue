"""Unit tests for websocket connection manager behavior."""

from __future__ import annotations

import asyncio
import json

from app.websocket.manager import ConnectionManager


class DummyWebSocket:
    def __init__(self, *, fail_send: bool = False) -> None:
        self.fail_send = fail_send
        self.accepted = False
        self.sent_messages: list[str] = []

    async def accept(self) -> None:
        self.accepted = True

    async def send_text(self, message: str) -> None:
        if self.fail_send:
            raise RuntimeError("socket closed")
        self.sent_messages.append(message)


def test_connect_and_disconnect_manage_active_set() -> None:
    manager = ConnectionManager()
    ws = DummyWebSocket()

    asyncio.run(manager.connect(ws))
    assert ws.accepted is True
    assert ws in manager.active_connections

    asyncio.run(manager.disconnect(ws))
    assert ws not in manager.active_connections


def test_send_snapshot_success_serializes_payload() -> None:
    manager = ConnectionManager()
    ws = DummyWebSocket()

    asyncio.run(manager.connect(ws))
    sent = asyncio.run(manager.send_snapshot(ws, {"zones": []}))

    assert sent is True
    payload = json.loads(ws.sent_messages[0])
    assert payload["type"] == "snapshot"
    assert payload["data"] == {"zones": []}


def test_send_snapshot_failure_disconnects_socket() -> None:
    manager = ConnectionManager()
    ws = DummyWebSocket(fail_send=True)

    asyncio.run(manager.connect(ws))
    sent = asyncio.run(manager.send_snapshot(ws, {"zones": []}))

    assert sent is False
    assert ws not in manager.active_connections


def test_should_broadcast_zone_uses_delta_and_risk_change() -> None:
    manager = ConnectionManager()
    manager._last_zone_states["north"] = {"occupancy_pct": 50.0, "risk_level": "low"}

    assert manager._should_broadcast_zone("north", {"occupancy_pct": 51.0, "risk_level": "low"}) is False
    assert manager._should_broadcast_zone("north", {"occupancy_pct": 53.0, "risk_level": "low"}) is True
    assert manager._should_broadcast_zone("north", {"occupancy_pct": 51.0, "risk_level": "high"}) is True


def test_broadcast_zone_update_filters_payload() -> None:
    manager = ConnectionManager()
    ws = DummyWebSocket()
    asyncio.run(manager.connect(ws))

    manager._last_zone_states["north"] = {"zone_id": "north", "occupancy_pct": 50.0, "risk_level": "low"}

    asyncio.run(
        manager.broadcast_zone_update(
            [
                {"zone_id": "north", "occupancy_pct": 51.0, "risk_level": "low"},
                {"zone_id": "south", "occupancy_pct": 70.0, "risk_level": "medium"},
            ]
        )
    )

    assert len(ws.sent_messages) == 1
    payload = json.loads(ws.sent_messages[0])
    assert payload["type"] == "zone_update"
    assert len(payload["data"]) == 1
    assert payload["data"][0]["zone_id"] == "south"


def test_pipeline_and_alert_broadcast_types() -> None:
    manager = ConnectionManager()
    ws = DummyWebSocket()
    asyncio.run(manager.connect(ws))

    asyncio.run(
        manager.broadcast_pipeline_update(
            {
                "run_id": "run-1",
                "hotspots": ["north"],
                "cascade_zones": [],
                "decisions": [{"action_type": "routing"}],
                "communication": {"narration": "active"},
                "confidence_overall": 0.9,
            }
        )
    )
    asyncio.run(manager.broadcast_alert({"alert_id": "alert-1"}))

    first = json.loads(ws.sent_messages[0])
    second = json.loads(ws.sent_messages[1])
    assert first["type"] == "pipeline_update"
    assert second["type"] == "alert"


def test_broadcast_removes_dead_connections() -> None:
    manager = ConnectionManager()
    good = DummyWebSocket()
    dead = DummyWebSocket(fail_send=True)
    asyncio.run(manager.connect(good))
    asyncio.run(manager.connect(dead))

    asyncio.run(manager._broadcast("ping"))

    assert good in manager.active_connections
    assert dead not in manager.active_connections

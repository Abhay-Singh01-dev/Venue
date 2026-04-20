"""Security-oriented regression tests for API behavior and configuration signals."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient
import pytest

from app.api.routes_simulation import router as simulation_router
from app.api.routes_system import router as system_router
from app.api.routes_zones import router as zones_router
import app.api.routes_simulation as routes_simulation
import app.api.routes_system as routes_system
import app.api.routes_zones as routes_zones
import app.main as app_main
from app.main import SecurityHeadersMiddleware
from app.core.settings import settings


def _test_client_with_cors(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setattr(routes_system, "db", None)
    monkeypatch.setattr(routes_simulation, "db", None)
    monkeypatch.setattr(routes_zones, "db", None)

    app = FastAPI()
    origins = settings.cors_origins or ["http://localhost:5173"]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=("*" not in origins),
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(SecurityHeadersMiddleware)
    app.include_router(system_router)
    app.include_router(simulation_router)
    app.include_router(zones_router)
    return TestClient(app)


def test_cors_preflight_headers_present(monkeypatch: pytest.MonkeyPatch) -> None:
    client = _test_client_with_cors(monkeypatch)

    response = client.options(
        "/",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )

    assert response.status_code in [200, 204]
    assert "access-control-allow-origin" in response.headers


def test_security_headers_present(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(app_main, "db", None)
    monkeypatch.setattr(routes_system, "db", None)
    monkeypatch.setattr(routes_simulation, "db", None)
    monkeypatch.setattr(routes_zones, "db", None)

    client = TestClient(app_main.app)

    response = client.get("/")

    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["referrer-policy"] == "strict-origin-when-cross-origin"


def test_invalid_simulation_phase_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    client = _test_client_with_cors(monkeypatch)

    response = client.post("/simulation/phase", json={"phase": "invalid_phase_value"})

    assert response.status_code == 400


def test_zone_lookup_with_missing_id_returns_non_500(monkeypatch: pytest.MonkeyPatch) -> None:
    client = _test_client_with_cors(monkeypatch)

    response = client.get("/zones/does-not-exist")

    assert response.status_code in [404, 503]


def test_root_does_not_leak_credentials(monkeypatch: pytest.MonkeyPatch) -> None:
    client = _test_client_with_cors(monkeypatch)

    response = client.get("/")
    payload = response.json()
    serialized = str(payload).lower()

    assert "api_key" not in serialized
    assert "private_key" not in serialized
    assert "gcp_sa" not in serialized

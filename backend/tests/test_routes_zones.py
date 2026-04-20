"""Zone route tests covering synthetic fallback and validation paths."""

import pytest


def test_zones_list_no_db_returns_synthetic(app_client) -> None:
    response = app_client.get("/zones/")
    assert response.status_code == 200
    payload = response.json()
    assert "zones" in payload
    assert payload["count"] > 0


def test_zones_sorted_by_occupancy_descending(app_client) -> None:
    response = app_client.get("/zones/")
    zones = response.json()["zones"]
    pcts = [z["occupancy_pct"] for z in zones]
    assert pcts == sorted(pcts, reverse=True)


@pytest.mark.parametrize("zone_id", ["north_concourse", "south_gate", "east_deck"])
def test_zone_by_id_no_db_returns_503(app_client, zone_id: str) -> None:
    response = app_client.get(f"/zones/{zone_id}")
    assert response.status_code == 503


def test_zone_id_validation_rejects_bad_format(app_client) -> None:
    response = app_client.get("/zones/BADZONE")
    assert response.status_code == 400
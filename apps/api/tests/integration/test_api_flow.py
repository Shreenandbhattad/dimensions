from __future__ import annotations

import time
from uuid import UUID

from app.repositories.deps import get_store


def _site_payload() -> dict[str, object]:
    return {
        "name": "Mumbai Parcel A",
        "city_code": "MUMBAI",
        "polygon_geojson": {
            "type": "Polygon",
            "coordinates": [
                [
                    [72.826, 19.076],
                    [72.828, 19.076],
                    [72.828, 19.078],
                    [72.826, 19.078],
                    [72.826, 19.076],
                ]
            ],
        },
    }


def _wait_for_terminal_job(client, job_id: str, timeout_s: float = 8.0) -> dict[str, object]:
    deadline = time.time() + timeout_s
    latest: dict[str, object] = {}
    while time.time() < deadline:
        response = client.get(f"/api/v1/jobs/{job_id}")
        assert response.status_code == 200
        latest = response.json()
        if latest["status"] in {"complete", "failed"}:
            return latest
        time.sleep(0.1)
    raise AssertionError(f"Job {job_id} did not reach terminal state in {timeout_s}s: {latest}")


def test_site_creation_triggers_context_ingestion(client, monkeypatch) -> None:
    async def fake_buildings(_polygon):
        return [
            {
                "osm_id": 1001,
                "footprint_geojson": {
                    "type": "Polygon",
                    "coordinates": [
                        [
                            [72.8259, 19.0759],
                            [72.8261, 19.0759],
                            [72.8261, 19.0761],
                            [72.8259, 19.0761],
                            [72.8259, 19.0759],
                        ]
                    ],
                },
                "height_m": 20.0,
                "storeys": 6,
                "building_type": "residential",
            }
        ]

    async def fake_dem(_polygon):
        return [{"lat": 19.076, "lng": 72.826, "elevation_m": 8.0}]

    monkeypatch.setattr("app.services.context_ingestion._fetch_osm_buildings_for_polygon", fake_buildings)
    monkeypatch.setattr("app.services.context_ingestion._fetch_dem_points", fake_dem)

    response = client.post("/api/v1/sites", json=_site_payload())
    assert response.status_code == 201
    data = response.json()
    job_id = data["context_job_id"]
    site_id = data["site_id"]

    job_payload = _wait_for_terminal_job(client, job_id)
    assert job_payload["status"] == "complete"
    assert job_payload["result"]["building_count"] == 1

    context_response = client.get(f"/api/v1/sites/{site_id}/context")
    assert context_response.status_code == 200
    context = context_response.json()
    assert context["context_ready"] is True
    assert len(context["buildings"]) == 1


def test_generation_returns_six_compliant_variants(client, monkeypatch) -> None:
    async def fake_buildings(_polygon):
        return []

    async def fake_dem(_polygon):
        return [{"lat": 19.076, "lng": 72.826, "elevation_m": 0.0}]

    monkeypatch.setattr("app.services.context_ingestion._fetch_osm_buildings_for_polygon", fake_buildings)
    monkeypatch.setattr("app.services.context_ingestion._fetch_dem_points", fake_dem)

    create_response = client.post("/api/v1/sites", json=_site_payload())
    context_job_id = create_response.json()["context_job_id"]
    _wait_for_terminal_job(client, context_job_id)
    site_id = create_response.json()["site_id"]

    generate_payload = {
        "zoning_constraints": {
            "max_height_m": 120,
            "far": 3.0,
            "setbacks": {"front": 6, "side": 4.5, "rear": 4.5},
            "coverage_ratio": 0.45,
        },
        "objectives": ["solar_access", "gfa_sqm"],
        "num_variants": 6,
        "seed": 42,
    }
    generate_response = client.post(f"/api/v1/sites/{site_id}/generate", json=generate_payload)
    assert generate_response.status_code == 202
    job_id = generate_response.json()["job_id"]

    job_payload = _wait_for_terminal_job(client, job_id)
    result = job_payload["result"]
    assert result["generated_count"] == 6
    assert len(result["variant_ids"]) == 6

    for variant_id in result["variant_ids"]:
        variant_response = client.get(f"/api/v1/variants/{variant_id}")
        assert variant_response.status_code == 200
        variant = variant_response.json()
        flags = variant["compliance_flags"]
        assert flags["setback_ok"] is True
        assert flags["height_ok"] is True
        assert flags["far_ok"] is True
        assert flags["coverage_ok"] is True
        assert "solar_access" in variant["scores"]


def test_export_creates_url_and_audit_event(client, monkeypatch) -> None:
    async def fake_buildings(_polygon):
        return []

    async def fake_dem(_polygon):
        return [{"lat": 19.076, "lng": 72.826, "elevation_m": 0.0}]

    monkeypatch.setattr("app.services.context_ingestion._fetch_osm_buildings_for_polygon", fake_buildings)
    monkeypatch.setattr("app.services.context_ingestion._fetch_dem_points", fake_dem)

    site = client.post("/api/v1/sites", json=_site_payload()).json()
    _wait_for_terminal_job(client, site["context_job_id"])
    generate_payload = {
        "zoning_constraints": {
            "max_height_m": 120,
            "far": 3.0,
            "setbacks": {"front": 6, "side": 4.5, "rear": 4.5},
            "coverage_ratio": 0.45,
        },
        "num_variants": 6,
        "seed": 42,
    }
    job_id = client.post(f"/api/v1/sites/{site['site_id']}/generate", json=generate_payload).json()["job_id"]
    generation_payload = _wait_for_terminal_job(client, job_id)
    generation_result = generation_payload["result"]
    variant_id = generation_result["variant_ids"][0]

    export_response = client.post(
        f"/api/v1/variants/{variant_id}/export",
        json={"format": "ifc"},
    )
    assert export_response.status_code == 202
    payload = _wait_for_terminal_job(client, export_response.json()["export_id"])
    assert payload["status"] == "complete"
    assert payload["result"]["url"] is not None

    store = get_store()
    events = list(store.audit_events.values())
    assert any(event.event_type == "variant_exported" for event in events)


def test_ingestion_timeout_sets_failed_job(client, monkeypatch) -> None:
    async def fail_ingestion(_site_id: UUID, _store):
        raise TimeoutError("overpass timeout")

    monkeypatch.setattr("app.services.jobs.ingest_site_context", fail_ingestion)
    response = client.post("/api/v1/sites", json=_site_payload())
    assert response.status_code == 201
    job_id = response.json()["context_job_id"]

    payload = _wait_for_terminal_job(client, job_id)
    assert payload["status"] == "failed"
    assert "timeout" in payload["error"]


def test_job_stream_emits_update_and_done_events(client, monkeypatch) -> None:
    async def fake_buildings(_polygon):
        return []

    async def fake_dem(_polygon):
        return [{"lat": 19.076, "lng": 72.826, "elevation_m": 0.0}]

    monkeypatch.setattr("app.services.context_ingestion._fetch_osm_buildings_for_polygon", fake_buildings)
    monkeypatch.setattr("app.services.context_ingestion._fetch_dem_points", fake_dem)

    response = client.post("/api/v1/sites", json=_site_payload())
    job_id = response.json()["context_job_id"]

    with client.stream("GET", f"/api/v1/jobs/{job_id}/stream") as stream_response:
        assert stream_response.status_code == 200
        payload = "".join(chunk for chunk in stream_response.iter_text())

    assert "event: update" in payload
    assert "event: done" in payload

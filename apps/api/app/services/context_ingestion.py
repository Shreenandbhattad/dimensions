from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

import httpx
from shapely.geometry import Polygon, mapping

from app.core.config import get_settings
from app.core.presets import CITY_PRESETS
from app.models.entities import ContextBuilding
from app.repositories.store import InMemoryStore
from app.services.geospatial import bbox_geojson, polygon_to_geojson, validate_site_polygon_geojson
from app.services.storage import storage

settings = get_settings()


def _parse_height(tags: dict[str, Any]) -> tuple[float, int | None]:
    height_value = tags.get("height")
    storeys_value = tags.get("building:levels")
    if height_value:
        try:
            numeric = float(str(height_value).replace("m", "").strip())
            if numeric > 0:
                return numeric, None
        except ValueError:
            pass
    if storeys_value:
        try:
            storeys = int(float(storeys_value))
            if storeys > 0:
                return storeys * 3.2, storeys
        except ValueError:
            pass
    return 12.0, None


async def _fetch_osm_buildings_for_polygon(polygon: Polygon) -> list[dict[str, Any]]:
    minx, miny, maxx, maxy = polygon.bounds
    query = f"""
    [out:json][timeout:25];
    (
      way["building"]({miny},{minx},{maxy},{maxx});
      relation["building"]({miny},{minx},{maxy},{maxx});
    );
    out body geom;
    """
    try:
        async with httpx.AsyncClient(timeout=35) as client:
            response = await client.post(settings.overpass_url, data={"data": query})
            response.raise_for_status()
            payload = response.json()
    except Exception:
        return []

    buildings: list[dict[str, Any]] = []
    for element in payload.get("elements", []):
        geometry = element.get("geometry", [])
        if len(geometry) < 3:
            continue
        coords = [(pt["lon"], pt["lat"]) for pt in geometry]
        if coords[0] != coords[-1]:
            coords.append(coords[0])
        try:
            poly = Polygon(coords)
            if not poly.is_valid or poly.area <= 0:
                continue
        except Exception:
            continue
        tags = element.get("tags", {})
        height_m, storeys = _parse_height(tags)
        buildings.append(
            {
                "osm_id": int(element.get("id", 0)),
                "footprint_geojson": mapping(poly),
                "height_m": height_m,
                "storeys": storeys,
                "building_type": tags.get("building"),
            }
        )
    return buildings


def _build_dem_sample_grid(polygon: Polygon, grid_n: int = 4) -> list[tuple[float, float]]:
    minx, miny, maxx, maxy = polygon.bounds
    points: list[tuple[float, float]] = []
    for row in range(grid_n):
        for col in range(grid_n):
            x = minx + (maxx - minx) * (col / (grid_n - 1))
            y = miny + (maxy - miny) * (row / (grid_n - 1))
            points.append((y, x))
    return points


async def _fetch_dem_points(polygon: Polygon) -> list[dict[str, float]]:
    points = _build_dem_sample_grid(polygon)
    payload = {"locations": [{"latitude": lat, "longitude": lng} for lat, lng in points]}
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(settings.open_elevation_url, json=payload)
            response.raise_for_status()
            data = response.json()
            results = data.get("results", [])
            if results:
                return [
                    {
                        "lat": float(item["latitude"]),
                        "lng": float(item["longitude"]),
                        "elevation_m": float(item["elevation"]),
                    }
                    for item in results
                ]
    except Exception:
        pass
    return [{"lat": lat, "lng": lng, "elevation_m": 0.0} for lat, lng in points]


async def ingest_site_context(site_id: UUID, store: InMemoryStore) -> dict[str, Any]:
    site = store.get_site(site_id)
    if site is None:
        raise ValueError(f"Site {site_id} not found")

    polygon = validate_site_polygon_geojson(site.polygon_geojson)
    buildings_payload = await _fetch_osm_buildings_for_polygon(polygon)
    context_buildings = [
        ContextBuilding(
            site_id=site.id,
            osm_id=item["osm_id"],
            footprint_geojson=item["footprint_geojson"],
            height_m=item["height_m"],
            storeys=item["storeys"],
            building_type=item["building_type"],
        )
        for item in buildings_payload
    ]
    store.replace_context_buildings(site.id, context_buildings)

    dem_points = await _fetch_dem_points(polygon)
    context_payload = {
        "site_id": str(site.id),
        "site_polygon": polygon_to_geojson(polygon),
        "bbox": bbox_geojson(polygon),
        "buildings": buildings_payload,
        "dem_points": dem_points,
    }
    city_code = site.city_code.upper()
    constraints = CITY_PRESETS.get(city_code, CITY_PRESETS["MUMBAI"]).copy()
    context_key = f"sites/{site.id}/context/context.json"
    dem_key = f"sites/{site.id}/context/dem.json"
    storage.put_json(context_key, context_payload)
    storage.put_json(dem_key, {"dem_points": dem_points})

    now = datetime.now(UTC)
    store.update_site(
        site.id,
        context_ingested_at=now,
        context_s3_key=context_key,
        dem_s3_key=dem_key,
        zoning_constraints=constraints,
    )
    return {
        "site_id": str(site.id),
        "context_s3_key": context_key,
        "dem_s3_key": dem_key,
        "building_count": len(context_buildings),
        "ingested_at": now.isoformat(),
    }

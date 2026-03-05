from __future__ import annotations

from typing import Any

import numpy as np
from shapely.geometry import Point, Polygon

from app.models.entities import ContextBuilding


def _site_area_from_geojson(site_polygon_geojson: dict[str, Any]) -> float:
    polygon = Polygon(site_polygon_geojson["coordinates"][0])
    return max(float(polygon.area), 1e-6)


def _neighbor_density(context_buildings: list[ContextBuilding], site_centroid: tuple[float, float]) -> float:
    if not context_buildings:
        return 0.0
    cx, cy = site_centroid
    penalties: list[float] = []
    site_point = Point(cx, cy)
    for building in context_buildings:
        footprint = building.footprint_geojson["coordinates"][0]
        poly = Polygon(footprint)
        distance = max(poly.centroid.distance(site_point), 1.0)
        penalties.append(float(building.height_m) / distance)
    return float(np.clip(np.mean(penalties) / 12.0, 0.0, 1.0))


def score_variant(
    *,
    site_polygon_geojson: dict[str, Any],
    massing_params: dict[str, Any],
    metrics: dict[str, float],
    context_buildings: list[ContextBuilding],
    max_far: float,
    cost_per_sqm: float,
) -> dict[str, float]:
    blocks = massing_params.get("blocks", [])
    if not blocks:
        return {
            "solar_access": 0.0,
            "daylight_factor": 0.0,
            "shadow_impact": 1.0,
            "far_achieved": 0.0,
            "gfa_sqm": 0.0,
            "cost_index_usd": 0.0,
        }

    site_poly = Polygon(site_polygon_geojson["coordinates"][0])
    site_centroid = (site_poly.centroid.x, site_poly.centroid.y)
    density = _neighbor_density(context_buildings, site_centroid)
    avg_height = float(np.mean([float(block["height_m"]) for block in blocks]))
    height_penalty = float(np.clip(avg_height / 160.0, 0.0, 0.4))
    solar_access = float(np.clip(1.0 - 0.55 * density - height_penalty, 0.05, 0.98))

    facade_compactness = float(np.clip(metrics["footprint_area"] / max(metrics["gfa"], 1.0), 0.02, 1.0))
    daylight_factor = float(np.clip(solar_access * 0.85 + 0.15 * facade_compactness, 0.03, 0.95))

    shadow_raw = 0.25 * density
    shadow_raw += 0.35 * (avg_height / 120.0)
    shadow_raw += 0.4 * (metrics["footprint_area"] / max(site_poly.area, 1.0))
    shadow_impact = float(np.clip(shadow_raw, 0.02, 0.99))

    site_area = float(metrics.get("site_area", _site_area_from_geojson(site_polygon_geojson)))
    far_achieved = float(metrics["gfa"] / site_area)
    if max_far > 0:
        far_achieved = float(min(far_achieved, max_far))

    gfa_sqm = float(metrics["gfa"])
    cost_index_usd = float(gfa_sqm * cost_per_sqm)

    return {
        "solar_access": solar_access,
        "daylight_factor": daylight_factor,
        "shadow_impact": shadow_impact,
        "far_achieved": far_achieved,
        "gfa_sqm": gfa_sqm,
        "cost_index_usd": cost_index_usd,
    }

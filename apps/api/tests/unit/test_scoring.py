from __future__ import annotations

from uuid import UUID

from app.models.entities import ContextBuilding
from app.services.scoring import score_variant


def test_scoring_is_deterministic() -> None:
    site_polygon_geojson = {
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
    }
    massing_params = {
        "blocks": [
            {
                "name": "tower",
                "footprint_local": [[-10, -10], [10, -10], [10, 10], [-10, 10]],
                "height_m": 48.0,
                "floor_count": 14,
                "floor_height_m": 3.4,
                "material_hint": "concrete",
            }
        ]
    }
    metrics = {"footprint_area": 400.0, "gfa": 5600.0, "max_height": 48.0}
    context = [
        ContextBuilding(
            site_id=UUID("00000000-0000-0000-0000-000000000001"),
            osm_id=1,
            footprint_geojson={
                "type": "Polygon",
                "coordinates": [
                    [[72.8258, 19.0758], [72.8261, 19.0758], [72.8261, 19.0761], [72.8258, 19.0761], [72.8258, 19.0758]]
                ],
            },
            height_m=18.0,
        )
    ]
    first = score_variant(
        site_polygon_geojson=site_polygon_geojson,
        massing_params=massing_params,
        metrics=metrics,
        context_buildings=context,
        max_far=3.0,
        cost_per_sqm=780.0,
    )
    second = score_variant(
        site_polygon_geojson=site_polygon_geojson,
        massing_params=massing_params,
        metrics=metrics,
        context_buildings=context,
        max_far=3.0,
        cost_per_sqm=780.0,
    )
    assert first == second

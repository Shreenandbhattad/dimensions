from __future__ import annotations

from app.services.geospatial import (
    local_frame_for_polygon,
    project_polygon_to_local,
    project_polygon_to_wgs84,
    validate_site_polygon_geojson,
)


def test_polygon_roundtrip_preserves_area_tolerance() -> None:
    polygon_geojson = {
        "type": "Polygon",
        "coordinates": [
            [
                [72.826, 19.076],
                [72.8272, 19.076],
                [72.8272, 19.0771],
                [72.826, 19.0771],
                [72.826, 19.076],
            ]
        ],
    }
    polygon = validate_site_polygon_geojson(polygon_geojson)
    frame = local_frame_for_polygon(polygon)
    local_polygon = project_polygon_to_local(polygon, frame)
    roundtrip = project_polygon_to_wgs84(local_polygon, frame)

    original_area = polygon.area
    roundtrip_area = roundtrip.area
    relative_error = abs(roundtrip_area - original_area) / original_area
    assert relative_error < 0.02

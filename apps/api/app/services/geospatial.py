from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, cast

import pyproj
from shapely import affinity
from shapely.geometry import Polygon, mapping, shape
from shapely.geometry.base import BaseGeometry
from shapely.validation import make_valid


class PolygonValidationError(ValueError):
    pass


@dataclass(slots=True)
class LocalFrame:
    origin_lat: float
    origin_lng: float

    @property
    def transformer_to_local(self) -> pyproj.Transformer:
        local_crs = pyproj.CRS.from_proj4(
            f"+proj=aeqd +lat_0={self.origin_lat} +lon_0={self.origin_lng} +datum=WGS84 +units=m +no_defs"
        )
        return pyproj.Transformer.from_crs("EPSG:4326", local_crs, always_xy=True)

    @property
    def transformer_to_wgs84(self) -> pyproj.Transformer:
        local_crs = pyproj.CRS.from_proj4(
            f"+proj=aeqd +lat_0={self.origin_lat} +lon_0={self.origin_lng} +datum=WGS84 +units=m +no_defs"
        )
        return pyproj.Transformer.from_crs(local_crs, "EPSG:4326", always_xy=True)


def _coerce_polygon(geom: BaseGeometry) -> Polygon:
    if geom.geom_type == "Polygon":
        return Polygon(geom)
    if geom.geom_type == "MultiPolygon":
        largest = max(geom.geoms, key=lambda g: g.area)
        return Polygon(largest)
    raise PolygonValidationError("Geometry must be Polygon or MultiPolygon")


def validate_site_polygon_geojson(polygon_geojson: dict[str, Any]) -> Polygon:
    try:
        geom = shape(polygon_geojson)
    except Exception as exc:  # pragma: no cover - shape errors vary by version
        raise PolygonValidationError("Invalid GeoJSON geometry") from exc

    geom = make_valid(geom)
    polygon = _coerce_polygon(geom)
    if polygon.area <= 0:
        raise PolygonValidationError("Polygon area must be positive")
    if not polygon.is_valid:
        raise PolygonValidationError("Polygon is invalid")
    return polygon


def polygon_to_geojson(polygon: Polygon) -> dict[str, Any]:
    return cast(dict[str, Any], mapping(polygon))


def bbox_geojson(polygon: Polygon) -> dict[str, Any]:
    minx, miny, maxx, maxy = polygon.bounds
    bbox_polygon = Polygon([(minx, miny), (maxx, miny), (maxx, maxy), (minx, maxy)])
    return cast(dict[str, Any], mapping(bbox_polygon))


def local_frame_for_polygon(polygon: Polygon) -> LocalFrame:
    centroid = polygon.centroid
    return LocalFrame(origin_lat=centroid.y, origin_lng=centroid.x)


def project_polygon_to_local(polygon: Polygon, frame: LocalFrame) -> Polygon:
    transformer = frame.transformer_to_local
    coords = [transformer.transform(x, y) for (x, y) in polygon.exterior.coords]
    return Polygon(coords)


def project_polygon_to_wgs84(polygon: Polygon, frame: LocalFrame) -> Polygon:
    transformer = frame.transformer_to_wgs84
    coords = [transformer.transform(x, y) for (x, y) in polygon.exterior.coords]
    return Polygon(coords)


def scale_polygon_around_centroid(polygon: Polygon, factor: float) -> Polygon:
    if factor <= 0:
        raise ValueError("Scale factor must be > 0")
    return affinity.scale(polygon, xfact=factor, yfact=factor, origin="centroid")


def polygon_compactness(polygon: Polygon) -> float:
    if polygon.length == 0:
        return 0.0
    return float(4 * math.pi * polygon.area / (polygon.length**2))

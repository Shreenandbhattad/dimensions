from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from uuid import UUID, uuid4

import numpy as np
from shapely import affinity
from shapely.geometry import Polygon

from app.schemas.common import ZoningConstraints
from app.services.geospatial import (
    LocalFrame,
    local_frame_for_polygon,
    project_polygon_to_local,
    project_polygon_to_wgs84,
    validate_site_polygon_geojson,
)

TYPOLOGIES: tuple[str, ...] = (
    "point_tower",
    "podium_tower",
    "slab_block",
    "courtyard_block",
    "l_shape",
    "u_shape",
    "stepped_terrace",
    "perimeter_block",
)


class GenerationError(RuntimeError):
    pass


@dataclass(slots=True)
class ConstraintEnvelope:
    site_polygon_local: Polygon
    buildable_polygon_local: Polygon
    site_area: float
    max_height_m: float
    max_gfa: float
    max_coverage: float


def _lhs_samples(num_samples: int, dimensions: int, rng: np.random.Generator) -> np.ndarray:
    matrix = np.zeros((num_samples, dimensions))
    for dim in range(dimensions):
        cut_points = np.linspace(0, 1, num_samples + 1)
        points = cut_points[:-1] + (cut_points[1:] - cut_points[:-1]) * rng.random(num_samples)
        rng.shuffle(points)
        matrix[:, dim] = points
    return matrix


def _rectangle(cx: float, cy: float, width: float, depth: float, rotation_deg: float = 0.0) -> Polygon:
    half_w = width / 2
    half_d = depth / 2
    poly = Polygon(
        [
            (cx - half_w, cy - half_d),
            (cx + half_w, cy - half_d),
            (cx + half_w, cy + half_d),
            (cx - half_w, cy + half_d),
        ]
    )
    if rotation_deg:
        poly = affinity.rotate(poly, rotation_deg, origin=(cx, cy))
    return poly


def compute_constraint_envelope(
    site_polygon_geojson: dict[str, Any], zoning: ZoningConstraints
) -> tuple[ConstraintEnvelope, LocalFrame]:
    site_polygon_wgs84 = validate_site_polygon_geojson(site_polygon_geojson)
    frame = local_frame_for_polygon(site_polygon_wgs84)
    site_local = project_polygon_to_local(site_polygon_wgs84, frame)
    setback = max(zoning.setbacks.front, zoning.setbacks.side, zoning.setbacks.rear)
    buildable = site_local.buffer(-setback)
    if buildable.is_empty or buildable.area <= 0:
        raise GenerationError("Setbacks leave no buildable envelope")

    return (
        ConstraintEnvelope(
            site_polygon_local=site_local,
            buildable_polygon_local=buildable,
            site_area=float(site_local.area),
            max_height_m=float(zoning.max_height_m),
            max_gfa=float(site_local.area * zoning.far),
            max_coverage=float(site_local.area * zoning.coverage_ratio),
        ),
        frame,
    )


def _typology_blocks(
    typology: str, envelope: ConstraintEnvelope, params: np.ndarray, rng: np.random.Generator
) -> list[dict[str, Any]]:
    centroid = envelope.buildable_polygon_local.centroid
    bounds = envelope.buildable_polygon_local.bounds
    env_w = max(bounds[2] - bounds[0], 8.0)
    env_d = max(bounds[3] - bounds[1], 8.0)

    width = float(np.interp(params[0], [0, 1], [env_w * 0.25, env_w * 0.85]))
    depth = float(np.interp(params[1], [0, 1], [env_d * 0.25, env_d * 0.85]))
    height = float(np.interp(params[2], [0, 1], [18.0, envelope.max_height_m]))
    rotation = float(np.interp(params[3], [0, 1], [-35, 35]))
    floor_height = 3.4

    def block(poly: Polygon, name: str, block_height: float, material: str = "concrete") -> dict[str, Any]:
        block_height = min(block_height, envelope.max_height_m)
        floors = max(1, int(block_height / floor_height))
        return {
            "name": name,
            "footprint_local": [[float(x), float(y)] for x, y in poly.exterior.coords[:-1]],
            "height_m": float(floors * floor_height),
            "floor_count": floors,
            "floor_height_m": floor_height,
            "material_hint": material,
        }

    main = _rectangle(centroid.x, centroid.y, width, depth, rotation_deg=rotation)

    if typology == "point_tower":
        return [block(main, "tower", height)]
    if typology == "podium_tower":
        podium = _rectangle(centroid.x, centroid.y, width * 1.25, depth * 1.25, rotation_deg=rotation)
        return [block(podium, "podium", min(height * 0.35, 24.0)), block(main, "tower", height)]
    if typology == "slab_block":
        slab = _rectangle(centroid.x, centroid.y, width * 1.35, depth * 0.7, rotation_deg=rotation)
        return [block(slab, "slab", min(height, envelope.max_height_m * 0.7))]
    if typology == "courtyard_block":
        outer = _rectangle(centroid.x, centroid.y, width * 1.3, depth * 1.3, rotation_deg=rotation)
        inner = _rectangle(centroid.x, centroid.y, width * 0.55, depth * 0.55, rotation_deg=rotation)
        ring = outer.difference(inner)
        if ring.geom_type == "Polygon":
            return [block(ring, "courtyard_ring", min(height, envelope.max_height_m * 0.6))]
        parts = sorted(ring.geoms, key=lambda g: g.area, reverse=True)[:2]
        return [
            block(part, f"courtyard_part_{idx}", min(height, envelope.max_height_m * 0.6))
            for idx, part in enumerate(parts)
        ]
    if typology == "l_shape":
        wing_a = _rectangle(centroid.x - width * 0.15, centroid.y, width * 0.6, depth * 1.2, rotation_deg=rotation)
        wing_b = _rectangle(
            centroid.x + width * 0.15,
            centroid.y + depth * 0.2,
            width * 1.1,
            depth * 0.45,
            rotation_deg=rotation,
        )
        return [block(wing_a.union(wing_b), "l_block", min(height, envelope.max_height_m * 0.65))]
    if typology == "u_shape":
        left = _rectangle(centroid.x - width * 0.3, centroid.y, width * 0.28, depth, rotation_deg=rotation)
        right = _rectangle(centroid.x + width * 0.3, centroid.y, width * 0.28, depth, rotation_deg=rotation)
        base = _rectangle(centroid.x, centroid.y - depth * 0.28, width * 0.86, depth * 0.32, rotation_deg=rotation)
        return [block(left.union(right).union(base), "u_block", min(height, envelope.max_height_m * 0.62))]
    if typology == "stepped_terrace":
        base = _rectangle(centroid.x, centroid.y, width * 1.15, depth * 1.15, rotation_deg=rotation)
        mid = _rectangle(centroid.x, centroid.y + depth * 0.07, width * 0.9, depth * 0.9, rotation_deg=rotation)
        top = _rectangle(centroid.x, centroid.y + depth * 0.14, width * 0.7, depth * 0.65, rotation_deg=rotation)
        return [
            block(base, "base", min(height * 0.45, envelope.max_height_m * 0.45)),
            block(mid, "mid", min(height * 0.7, envelope.max_height_m * 0.7)),
            block(top, "top", min(height, envelope.max_height_m)),
        ]
    if typology == "perimeter_block":
        outer = _rectangle(centroid.x, centroid.y, width * 1.5, depth * 1.5, rotation_deg=rotation)
        inner = _rectangle(centroid.x, centroid.y, width * 1.1, depth * 1.1, rotation_deg=rotation)
        ring = outer.difference(inner)
        if ring.geom_type == "Polygon":
            return [block(ring, "perimeter", min(height, envelope.max_height_m * 0.55))]
        parts = sorted(ring.geoms, key=lambda g: g.area, reverse=True)[:3]
        return [
            block(part, f"perimeter_{idx}", min(height, envelope.max_height_m * 0.55)) for idx, part in enumerate(parts)
        ]

    # Should never happen due to fixed typology list.
    raise GenerationError(f"Unsupported typology: {typology}")


def _block_polygon(block: dict[str, Any]) -> Polygon:
    return Polygon([(pt[0], pt[1]) for pt in block["footprint_local"]])


def _variant_metrics(blocks: list[dict[str, Any]]) -> dict[str, float]:
    footprint_area = float(sum(_block_polygon(block).area for block in blocks))
    gfa = float(sum(_block_polygon(block).area * float(block["floor_count"]) for block in blocks))
    max_height = float(max((float(block["height_m"]) for block in blocks), default=0.0))
    return {"footprint_area": footprint_area, "gfa": gfa, "max_height": max_height}


def _clip_blocks_to_envelope(blocks: list[dict[str, Any]], envelope: ConstraintEnvelope) -> list[dict[str, Any]]:
    clipped: list[dict[str, Any]] = []
    for block in blocks:
        poly = _block_polygon(block)
        clipped_poly = poly.intersection(envelope.buildable_polygon_local)
        if clipped_poly.is_empty:
            continue
        if clipped_poly.geom_type == "Polygon":
            parts = [clipped_poly]
        else:
            parts = [part for part in clipped_poly.geoms if part.area > 1.0]
        for index, part in enumerate(parts):
            block_copy = dict(block)
            block_copy["name"] = f"{block['name']}_{index}"
            block_copy["footprint_local"] = [[float(x), float(y)] for x, y in part.exterior.coords[:-1]]
            clipped.append(block_copy)
    return clipped


def _compliance(blocks: list[dict[str, Any]], envelope: ConstraintEnvelope) -> dict[str, bool]:
    metrics = _variant_metrics(blocks)
    all_within = True
    for block in blocks:
        if not _block_polygon(block).within(envelope.buildable_polygon_local.buffer(1e-6)):
            all_within = False
            break
    return {
        "setback_ok": all_within,
        "height_ok": metrics["max_height"] <= envelope.max_height_m + 1e-6,
        "far_ok": metrics["gfa"] <= envelope.max_gfa + 1e-6,
        "coverage_ok": metrics["footprint_area"] <= envelope.max_coverage + 1e-6,
    }


def _similarity_signature(blocks: list[dict[str, Any]]) -> np.ndarray:
    metrics = _variant_metrics(blocks)
    average_height = float(np.mean([float(b["height_m"]) for b in blocks])) if blocks else 0.0
    return np.array(
        [
            metrics["footprint_area"],
            metrics["gfa"],
            metrics["max_height"],
            average_height,
            len(blocks),
        ],
        dtype=np.float64,
    )


def _is_diverse(candidate_signature: np.ndarray, accepted: list[np.ndarray], threshold: float) -> bool:
    if not accepted:
        return True
    normalized = candidate_signature / np.maximum(candidate_signature.max(), 1.0)
    for existing in accepted:
        existing_norm = existing / np.maximum(existing.max(), 1.0)
        dist = float(np.linalg.norm(normalized - existing_norm))
        if dist < threshold:
            return False
    return True


def _local_to_wgs84_polygon_coords(block: dict[str, Any], frame: LocalFrame) -> list[list[float]]:
    poly_local = _block_polygon(block)
    poly_wgs84 = project_polygon_to_wgs84(poly_local, frame)
    return [[float(x), float(y)] for x, y in poly_wgs84.exterior.coords[:-1]]


def generate_variants(
    *,
    site_id: UUID,
    site_polygon_geojson: dict[str, Any],
    zoning: ZoningConstraints,
    num_variants: int,
    seed: int,
) -> list[dict[str, Any]]:
    envelope, frame = compute_constraint_envelope(site_polygon_geojson, zoning)
    rng = np.random.default_rng(seed)
    generation_run_id = str(uuid4())
    sample_count = max(num_variants * len(TYPOLOGIES), 32)
    lhs = _lhs_samples(sample_count, 4, rng)

    candidates: list[dict[str, Any]] = []
    for index in range(sample_count):
        typology = TYPOLOGIES[index % len(TYPOLOGIES)]
        raw_blocks = _typology_blocks(typology, envelope, lhs[index], rng)
        clipped_blocks = _clip_blocks_to_envelope(raw_blocks, envelope)
        if not clipped_blocks:
            continue
        compliance_flags = _compliance(clipped_blocks, envelope)
        if not all(compliance_flags.values()):
            continue
        metrics = _variant_metrics(clipped_blocks)
        metrics["site_area"] = envelope.site_area
        candidates.append(
            {
                "site_id": str(site_id),
                "generation_run_id": generation_run_id,
                "typology": typology,
                "blocks": clipped_blocks,
                "metrics": metrics,
                "compliance_flags": compliance_flags,
                "frame_origin": {"lat": frame.origin_lat, "lng": frame.origin_lng},
            }
        )

    if not candidates:
        raise GenerationError("No compliant variants could be generated")

    accepted: list[dict[str, Any]] = []
    signatures: list[np.ndarray] = []
    for candidate in candidates:
        signature = _similarity_signature(candidate["blocks"])
        if _is_diverse(signature, signatures, threshold=0.22):
            signatures.append(signature)
            accepted.append(candidate)
        if len(accepted) == num_variants:
            break

    if len(accepted) < num_variants:
        for candidate in candidates:
            if candidate in accepted:
                continue
            accepted.append(candidate)
            if len(accepted) == num_variants:
                break

    prepared: list[dict[str, Any]] = []
    for candidate in accepted[:num_variants]:
        blocks = candidate["blocks"]
        massing_blocks: list[dict[str, Any]] = []
        for block in blocks:
            massing_blocks.append(
                {
                    **block,
                    "footprint_wgs84": _local_to_wgs84_polygon_coords(block, frame),
                }
            )
        prepared.append(
            {
                "site_id": candidate["site_id"],
                "generation_run_id": candidate["generation_run_id"],
                "typology": candidate["typology"],
                "massing_params": {
                    "blocks": massing_blocks,
                    "frame_origin": candidate["frame_origin"],
                },
                "compliance_flags": candidate["compliance_flags"],
                "metrics": candidate["metrics"],
            }
        )
    return prepared

from __future__ import annotations

from uuid import UUID

import pytest

from app.schemas.common import SetbackConstraints, ZoningConstraints
from app.services.generation import GenerationError, compute_constraint_envelope, generate_variants


def test_constraint_solver_rejects_impossible_setbacks() -> None:
    tiny_polygon = {
        "type": "Polygon",
        "coordinates": [
            [
                [72.826, 19.076],
                [72.82615, 19.076],
                [72.82615, 19.0761],
                [72.826, 19.0761],
                [72.826, 19.076],
            ]
        ],
    }
    zoning = ZoningConstraints(
        max_height_m=60,
        far=1.5,
        setbacks=SetbackConstraints(front=30, side=30, rear=30),
        coverage_ratio=0.3,
    )
    with pytest.raises(GenerationError):
        compute_constraint_envelope(tiny_polygon, zoning)


def test_generation_is_deterministic_for_seed() -> None:
    polygon = {
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
    zoning = ZoningConstraints()
    first = generate_variants(
        site_id=UUID("00000000-0000-0000-0000-000000000001"),
        site_polygon_geojson=polygon,
        zoning=zoning,
        num_variants=6,
        seed=42,
    )
    second = generate_variants(
        site_id=UUID("00000000-0000-0000-0000-000000000001"),
        site_polygon_geojson=polygon,
        zoning=zoning,
        num_variants=6,
        seed=42,
    )
    assert [v["typology"] for v in first] == [v["typology"] for v in second]
    assert [v["metrics"] for v in first] == [v["metrics"] for v in second]

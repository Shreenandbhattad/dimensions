from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

from app.schemas.common import JobStatus


def utc_now() -> datetime:
    return datetime.now(UTC)


@dataclass(slots=True)
class Site:
    name: str
    city_code: str
    polygon_geojson: dict[str, Any]
    bbox_geojson: dict[str, Any]
    local_crs_origin: dict[str, float]
    zoning_constraints: dict[str, Any]
    id: UUID = field(default_factory=uuid4)
    context_ingested_at: datetime | None = None
    context_s3_key: str | None = None
    dem_s3_key: str | None = None
    created_at: datetime = field(default_factory=utc_now)
    updated_at: datetime = field(default_factory=utc_now)


@dataclass(slots=True)
class ContextBuilding:
    site_id: UUID
    osm_id: int
    footprint_geojson: dict[str, Any]
    height_m: float
    storeys: int | None = None
    building_type: str | None = None
    id: UUID = field(default_factory=uuid4)
    created_at: datetime = field(default_factory=utc_now)


@dataclass(slots=True)
class Variant:
    site_id: UUID
    generation_run_id: UUID
    typology: str
    massing_params: dict[str, Any]
    scores: dict[str, Any]
    compliance_flags: dict[str, bool]
    gltf_s3_key: str | None = None
    ifc_s3_key: str | None = None
    id: UUID = field(default_factory=uuid4)
    is_exported: bool = False
    created_at: datetime = field(default_factory=utc_now)


@dataclass(slots=True)
class Job:
    job_type: str
    payload: dict[str, Any]
    site_id: UUID | None = None
    variant_id: UUID | None = None
    id: UUID = field(default_factory=uuid4)
    status: JobStatus = JobStatus.QUEUED
    progress: int = 0
    result: dict[str, Any] = field(default_factory=dict)
    error: str | None = None
    created_at: datetime = field(default_factory=utc_now)
    updated_at: datetime = field(default_factory=utc_now)


@dataclass(slots=True)
class Export:
    variant_id: UUID
    format: str
    id: UUID = field(default_factory=uuid4)
    status: JobStatus = JobStatus.QUEUED
    s3_key: str | None = None
    download_url: str | None = None
    requested_at: datetime = field(default_factory=utc_now)
    completed_at: datetime | None = None


@dataclass(slots=True)
class AuditEvent:
    event_type: str
    event_payload: dict[str, Any]
    site_id: UUID | None = None
    variant_id: UUID | None = None
    id: UUID = field(default_factory=uuid4)
    created_at: datetime = field(default_factory=utc_now)

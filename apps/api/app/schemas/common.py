from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class JobStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETE = "complete"
    FAILED = "failed"


class ExportFormat(str, Enum):
    GLTF = "gltf"
    IFC = "ifc"


class SetbackConstraints(BaseModel):
    front: float = Field(default=6.0, ge=0)
    side: float = Field(default=4.5, ge=0)
    rear: float = Field(default=4.5, ge=0)


class ZoningConstraints(BaseModel):
    max_height_m: float = Field(default=120.0, gt=0)
    far: float = Field(default=3.0, gt=0)
    setbacks: SetbackConstraints = Field(default_factory=SetbackConstraints)
    coverage_ratio: float = Field(default=0.45, gt=0, le=1)


class MassingBlock(BaseModel):
    name: str
    footprint_local: list[list[float]]
    height_m: float
    floor_count: int
    floor_height_m: float
    material_hint: str = "concrete"


class VariantScores(BaseModel):
    solar_access: float = Field(ge=0, le=1)
    daylight_factor: float = Field(ge=0, le=1)
    shadow_impact: float = Field(ge=0, le=1)
    far_achieved: float = Field(ge=0)
    gfa_sqm: float = Field(ge=0)
    cost_index_usd: float = Field(ge=0)


class ComplianceFlags(BaseModel):
    setback_ok: bool
    height_ok: bool
    far_ok: bool
    coverage_ok: bool


class SiteCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    polygon_geojson: dict[str, Any]
    city_code: str = Field(default="MUMBAI")


class SiteCreateResponse(BaseModel):
    site_id: UUID
    context_job_id: UUID
    status: JobStatus


class SiteResponse(BaseModel):
    id: UUID
    name: str
    city_code: str
    polygon_geojson: dict[str, Any]
    bbox_geojson: dict[str, Any]
    context_ingested_at: datetime | None
    context_s3_key: str | None
    zoning_constraints: ZoningConstraints
    created_at: datetime
    updated_at: datetime


class ContextBuildingFeature(BaseModel):
    osm_id: int
    height_m: float
    storeys: int | None
    building_type: str | None
    footprint_geojson: dict[str, Any]


class SiteContextResponse(BaseModel):
    site_id: UUID
    context_ready: bool
    context_artifact_url: str | None
    dem_artifact_url: str | None
    suggested_constraints: ZoningConstraints
    buildings: list[ContextBuildingFeature]


class GenerateRequest(BaseModel):
    zoning_constraints: ZoningConstraints
    objectives: list[str] = Field(default_factory=lambda: ["solar_access", "gfa_sqm"])
    num_variants: int = Field(default=6, ge=1, le=12)
    seed: int = Field(default=42)


class JobResponse(BaseModel):
    id: UUID
    status: JobStatus
    progress: int = Field(ge=0, le=100)
    job_type: str
    result: dict[str, Any]
    error: str | None
    created_at: datetime
    updated_at: datetime


class GenerateResponse(BaseModel):
    job_id: UUID


class VariantResponse(BaseModel):
    id: UUID
    site_id: UUID
    generation_run_id: UUID
    typology: str
    massing_params: dict[str, Any]
    scores: VariantScores
    compliance_flags: ComplianceFlags
    gltf_download_url: str | None
    ifc_download_url: str | None
    created_at: datetime


class ExportRequest(BaseModel):
    format: ExportFormat


class ExportResponse(BaseModel):
    export_id: UUID
    status: JobStatus
    url: str | None
    expires_in_seconds: int


class ProjectListItem(BaseModel):
    id: UUID
    name: str
    city_code: str
    updated_at: datetime
    variant_count: int
    context_ready: bool


class ProjectListResponse(BaseModel):
    projects: list[ProjectListItem]


class FeedbackRequest(BaseModel):
    variant_id: UUID
    feedback: str = Field(pattern="^(up|down)$")
    message: str | None = Field(default=None, max_length=2000)


class FeedbackResponse(BaseModel):
    recorded: bool
    event_id: UUID

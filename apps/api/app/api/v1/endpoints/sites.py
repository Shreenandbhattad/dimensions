from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.presets import CITY_PRESETS
from app.models.entities import Job, Site
from app.repositories.deps import get_store
from app.repositories.store import InMemoryStore
from app.schemas.common import (
    ContextBuildingFeature,
    JobStatus,
    SiteContextResponse,
    SiteCreateRequest,
    SiteCreateResponse,
    SiteResponse,
    ZoningConstraints,
)
from app.services.geospatial import (
    bbox_geojson,
    local_frame_for_polygon,
    polygon_to_geojson,
    validate_site_polygon_geojson,
)
from app.services.storage import storage
from app.workers.dispatch import enqueue_context_ingest

router = APIRouter(prefix="/sites", tags=["sites"])


@router.post("", response_model=SiteCreateResponse, status_code=status.HTTP_201_CREATED)
def create_site(
    payload: SiteCreateRequest,
    store: InMemoryStore = Depends(get_store),
) -> SiteCreateResponse:
    city_code = payload.city_code.upper()
    preset = CITY_PRESETS.get(city_code, CITY_PRESETS["MUMBAI"])
    polygon = validate_site_polygon_geojson(payload.polygon_geojson)
    frame = local_frame_for_polygon(polygon)
    site = Site(
        name=payload.name.strip(),
        city_code=city_code,
        polygon_geojson=polygon_to_geojson(polygon),
        bbox_geojson=bbox_geojson(polygon),
        local_crs_origin={"lat": frame.origin_lat, "lng": frame.origin_lng},
        zoning_constraints=preset,
    )
    store.create_site(site)

    job = Job(job_type="context_ingest", payload={}, site_id=site.id, status=JobStatus.QUEUED)
    store.create_job(job)
    enqueue_context_ingest(job.id)
    return SiteCreateResponse(site_id=site.id, context_job_id=job.id, status=job.status)


@router.get("/{site_id}", response_model=SiteResponse)
def get_site(site_id: str, store: InMemoryStore = Depends(get_store)) -> SiteResponse:
    from uuid import UUID

    site = store.get_site(UUID(site_id))
    if site is None:
        raise HTTPException(status_code=404, detail="Site not found")
    return SiteResponse(
        id=site.id,
        name=site.name,
        city_code=site.city_code,
        polygon_geojson=site.polygon_geojson,
        bbox_geojson=site.bbox_geojson,
        context_ingested_at=site.context_ingested_at,
        context_s3_key=site.context_s3_key,
        zoning_constraints=ZoningConstraints(**site.zoning_constraints),
        created_at=site.created_at,
        updated_at=site.updated_at,
    )


@router.get("/{site_id}/context", response_model=SiteContextResponse)
def get_site_context(site_id: str, store: InMemoryStore = Depends(get_store)) -> SiteContextResponse:
    from uuid import UUID

    parsed_id = UUID(site_id)
    site = store.get_site(parsed_id)
    if site is None:
        raise HTTPException(status_code=404, detail="Site not found")

    buildings = store.list_context_buildings(parsed_id)
    features = [
        ContextBuildingFeature(
            osm_id=b.osm_id,
            height_m=b.height_m,
            storeys=b.storeys,
            building_type=b.building_type,
            footprint_geojson=b.footprint_geojson,
        )
        for b in buildings
    ]

    return SiteContextResponse(
        site_id=parsed_id,
        context_ready=site.context_ingested_at is not None,
        context_artifact_url=storage.get_presigned_url(site.context_s3_key),
        dem_artifact_url=storage.get_presigned_url(site.dem_s3_key),
        suggested_constraints=ZoningConstraints(**site.zoning_constraints),
        buildings=features,
    )

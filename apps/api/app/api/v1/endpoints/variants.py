from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from app.models.entities import Job
from app.repositories.deps import get_store
from app.repositories.store import InMemoryStore
from app.schemas.common import (
    ComplianceFlags,
    ExportRequest,
    ExportResponse,
    JobStatus,
    VariantResponse,
    VariantScores,
)
from app.services.storage import storage
from app.workers.dispatch import enqueue_variant_export

router = APIRouter(prefix="/variants", tags=["variants"])


@router.get("/{variant_id}", response_model=VariantResponse)
def get_variant(variant_id: str, store: InMemoryStore = Depends(get_store)) -> VariantResponse:
    variant = store.get_variant(UUID(variant_id))
    if variant is None:
        raise HTTPException(status_code=404, detail="Variant not found")
    return VariantResponse(
        id=variant.id,
        site_id=variant.site_id,
        generation_run_id=variant.generation_run_id,
        typology=variant.typology,
        massing_params=variant.massing_params,
        scores=VariantScores(**variant.scores),
        compliance_flags=ComplianceFlags(**variant.compliance_flags),
        gltf_download_url=storage.get_presigned_url(variant.gltf_s3_key),
        ifc_download_url=storage.get_presigned_url(variant.ifc_s3_key),
        created_at=variant.created_at,
    )


@router.post("/{variant_id}/export", response_model=ExportResponse, status_code=status.HTTP_202_ACCEPTED)
def export_variant(
    variant_id: str,
    payload: ExportRequest,
    store: InMemoryStore = Depends(get_store),
) -> ExportResponse:
    parsed_id = UUID(variant_id)
    variant = store.get_variant(parsed_id)
    if variant is None:
        raise HTTPException(status_code=404, detail="Variant not found")

    job = Job(
        job_type="variant_export",
        variant_id=parsed_id,
        payload={"format": payload.format.value},
        status=JobStatus.QUEUED,
    )
    store.create_job(job)
    enqueue_variant_export(job.id)
    finished_job = store.get_job(job.id)
    if finished_job is None:
        raise HTTPException(status_code=500, detail="Export job unavailable")

    return ExportResponse(
        export_id=UUID(finished_job.result.get("export_id", str(job.id))),
        status=finished_job.status,
        url=finished_job.result.get("url"),
        expires_in_seconds=3600,
    )

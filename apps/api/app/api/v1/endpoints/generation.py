from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from app.models.entities import Job
from app.repositories.deps import get_store
from app.repositories.store import InMemoryStore
from app.schemas.common import GenerateRequest, GenerateResponse, JobStatus
from app.workers.dispatch import enqueue_variant_generate

router = APIRouter(prefix="/sites", tags=["generation"])


@router.post("/{site_id}/generate", response_model=GenerateResponse, status_code=status.HTTP_202_ACCEPTED)
def generate_variants_for_site(
    site_id: str,
    payload: GenerateRequest,
    store: InMemoryStore = Depends(get_store),
) -> GenerateResponse:
    parsed_id = UUID(site_id)
    site = store.get_site(parsed_id)
    if site is None:
        raise HTTPException(status_code=404, detail="Site not found")
    if site.context_ingested_at is None:
        raise HTTPException(status_code=409, detail="Site context is not ready yet")

    job = Job(
        job_type="variant_generate",
        site_id=parsed_id,
        payload=payload.model_dump(),
        status=JobStatus.QUEUED,
    )
    store.create_job(job)
    enqueue_variant_generate(job.id)
    return GenerateResponse(job_id=job.id)

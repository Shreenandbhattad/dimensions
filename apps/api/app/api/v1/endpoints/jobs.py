from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app.repositories.deps import get_store
from app.repositories.store import InMemoryStore
from app.schemas.common import JobResponse

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.get("/{job_id}", response_model=JobResponse)
def get_job(job_id: str, store: InMemoryStore = Depends(get_store)) -> JobResponse:
    job = store.get_job(UUID(job_id))
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return JobResponse(
        id=job.id,
        status=job.status,
        progress=job.progress,
        job_type=job.job_type,
        result=job.result,
        error=job.error,
        created_at=job.created_at,
        updated_at=job.updated_at,
    )

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from app.repositories.deps import get_store
from app.repositories.store import InMemoryStore
from app.schemas.common import JobResponse

router = APIRouter(prefix="/jobs", tags=["jobs"])


def _serialize_job(job: object) -> dict[str, object]:
    from app.models.entities import Job

    cast_job = job if isinstance(job, Job) else None
    if cast_job is None:
        return {}
    status_value = cast_job.status.value if hasattr(cast_job.status, "value") else str(cast_job.status)
    return {
        "id": str(cast_job.id),
        "status": status_value,
        "progress": cast_job.progress,
        "job_type": cast_job.job_type,
        "result": cast_job.result,
        "error": cast_job.error,
        "created_at": cast_job.created_at.isoformat(),
        "updated_at": cast_job.updated_at.isoformat(),
    }


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


@router.get("/{job_id}/stream")
async def stream_job(job_id: str, request: Request, store: InMemoryStore = Depends(get_store)) -> StreamingResponse:
    parsed_id = UUID(job_id)
    if store.get_job(parsed_id) is None:
        raise HTTPException(status_code=404, detail="Job not found")

    async def event_generator() -> AsyncIterator[str]:
        last_payload: str | None = None
        while True:
            if await request.is_disconnected():
                break
            job = store.get_job(parsed_id)
            if job is None:
                error_payload = {"error": "job_not_found", "id": str(parsed_id)}
                yield f"event: error\ndata: {json.dumps(error_payload)}\n\n"
                break

            serialized = _serialize_job(job)
            serialized_json = json.dumps(serialized)
            if serialized_json != last_payload:
                yield f"event: update\ndata: {serialized_json}\n\n"
                last_payload = serialized_json

            status = serialized.get("status")
            if status in {"complete", "failed"}:
                yield f"event: done\ndata: {serialized_json}\n\n"
                break
            await asyncio.sleep(0.5)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )

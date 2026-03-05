from __future__ import annotations

import asyncio
from uuid import UUID

from app.repositories.deps import get_store
from app.services.jobs import run_context_ingestion_job, run_export_job, run_variant_generation_job
from app.workers.celery_app import celery_app


@celery_app.task(name="app.workers.tasks.context_ingest_task")
def context_ingest_task(job_id: str) -> None:
    store = get_store()
    asyncio.run(run_context_ingestion_job(UUID(job_id), store))


@celery_app.task(name="app.workers.tasks.variant_generate_task")
def variant_generate_task(job_id: str) -> None:
    store = get_store()
    run_variant_generation_job(UUID(job_id), store)


@celery_app.task(name="app.workers.tasks.variant_export_task")
def variant_export_task(job_id: str) -> None:
    store = get_store()
    run_export_job(UUID(job_id), store)

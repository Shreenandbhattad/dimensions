from __future__ import annotations

from uuid import UUID

from app.workers.tasks import context_ingest_task, variant_export_task, variant_generate_task


def enqueue_context_ingest(job_id: UUID) -> None:
    context_ingest_task.delay(str(job_id))


def enqueue_variant_generate(job_id: UUID) -> None:
    variant_generate_task.delay(str(job_id))


def enqueue_variant_export(job_id: UUID) -> None:
    variant_export_task.delay(str(job_id))

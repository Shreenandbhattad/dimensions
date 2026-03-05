from __future__ import annotations

import threading
from collections.abc import Callable
from uuid import UUID

from app.core.config import get_settings
from app.workers.tasks import context_ingest_task, variant_export_task, variant_generate_task

settings = get_settings()


def _spawn_local_worker(target: Callable[[str], None], job_id: UUID) -> None:
    thread = threading.Thread(target=target, args=(str(job_id),), daemon=True)
    thread.start()


def enqueue_context_ingest(job_id: UUID) -> None:
    if settings.celery_task_always_eager:
        _spawn_local_worker(context_ingest_task, job_id)
        return
    context_ingest_task.delay(str(job_id))


def enqueue_variant_generate(job_id: UUID) -> None:
    if settings.celery_task_always_eager:
        _spawn_local_worker(variant_generate_task, job_id)
        return
    variant_generate_task.delay(str(job_id))


def enqueue_variant_export(job_id: UUID) -> None:
    if settings.celery_task_always_eager:
        _spawn_local_worker(variant_export_task, job_id)
        return
    variant_export_task.delay(str(job_id))

from __future__ import annotations

from celery import Celery

from app.core.config import get_settings

settings = get_settings()

celery_app = Celery("dimensions", broker=settings.redis_url, backend=settings.redis_url)
celery_app.conf.update(
    task_always_eager=settings.celery_task_always_eager,
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_routes={
        "app.workers.tasks.context_ingest_task": {"queue": "context_ingest"},
        "app.workers.tasks.variant_generate_task": {"queue": "variant_generate"},
        "app.workers.tasks.variant_export_task": {"queue": "variant_export"},
    },
)

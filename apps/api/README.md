# Dimensions API

## Commands

- Install: `pip install -e .[dev]`
- Run API: `uvicorn app.main:app --reload --port 8000`
- Run worker: `celery -A app.workers.celery_app.celery_app worker --loglevel=INFO -Q context_ingest,variant_generate,variant_export`
- Run tests: `pytest`
- Run migrations: `alembic upgrade head`

## Notes

- `CELERY_TASK_ALWAYS_EAGER=true` runs jobs in-process for local MVP development.
- Set `USE_IN_MEMORY_STORE=false` and wire SQL repositories for managed Postgres/PostGIS runtime.
- Artifacts are written to S3 if credentials are configured, otherwise to local `artifacts/`.


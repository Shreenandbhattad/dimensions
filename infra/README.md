# Infrastructure Baseline (MVP Kickoff)

## Managed Services

- Postgres/PostGIS: Neon or Supabase Postgres with PostGIS enabled.
- Redis: Upstash or Redis Cloud.
- Object Storage: AWS S3 (or S3-compatible endpoint).

## Runtime

- API: FastAPI on a single VM or managed container service.
- Worker: Celery worker process connected to managed Redis.
- Frontend: Vite build deployed to static hosting/CDN.

## Environment Checklist

1. Set `DATABASE_URL` to managed Postgres/PostGIS.
2. Set `REDIS_URL` to managed Redis.
3. Configure `S3_BUCKET`, credentials, and `S3_REGION`.
4. Set `CELERY_TASK_ALWAYS_EAGER=false` in staging/production.
5. Set `USE_IN_MEMORY_STORE=false` once SQL repositories are enabled.


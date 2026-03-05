# Dimensions

Dimensions is an AI-native generative design MVP for early-stage building massing.
This repository contains:

- `apps/api`: FastAPI backend, async job orchestration, and generation/scoring/export services.
- `apps/web`: React + TypeScript frontend with MapLibre and deck.gl for site/context and variant comparison.
- `packages/contracts`: Shared API and domain types for frontend/backend contract alignment.
- `infra`: Deployment and operational notes for managed Postgres/PostGIS, Redis, and S3-compatible storage.

## MVP Golden Path

1. Draw or geocode a site polygon.
2. Ingest context data (OSM + DEM surrogate).
3. Generate six compliant massing options.
4. Score options and compare in 3D.
5. Export selected option as GLTF and IFC 2x3 stub.

## Quick Start

1. Copy `.env.example` to `.env` and fill values.
2. Backend:
   - Install Python 3.11+.
   - `cd apps/api`
   - `pip install -e .[dev]`
   - `python -m uvicorn app.main:app --reload --port 8000`
3. Frontend:
   - `cd apps/web`
   - `npm install`
   - `npm run dev`
4. Open `http://localhost:5173`.

From repo root you can also run:

- `npm run api:dev`
- `npm run web:dev`

## Testing

- Backend: `cd apps/api && pytest`
- Frontend unit tests: `cd apps/web && npm run test`
- Frontend e2e: `cd apps/web && npm run test:e2e`

## CI

GitHub Actions run lint, type checks, and tests for both backend and frontend on pull requests.

from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.endpoints import feedback, generation, jobs, projects, sites, variants

api_router = APIRouter()
api_router.include_router(sites.router)
api_router.include_router(generation.router)
api_router.include_router(jobs.router)
api_router.include_router(variants.router)
api_router.include_router(projects.router)
api_router.include_router(feedback.router)

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.repositories.deps import get_store
from app.repositories.store import InMemoryStore
from app.schemas.common import ProjectListItem, ProjectListResponse

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=ProjectListResponse)
def list_projects(store: InMemoryStore = Depends(get_store)) -> ProjectListResponse:
    projects = []
    for site in store.list_sites():
        projects.append(
            ProjectListItem(
                id=site.id,
                name=site.name,
                city_code=site.city_code,
                updated_at=site.updated_at,
                variant_count=store.variant_count_by_site(site.id),
                context_ready=site.context_ingested_at is not None,
            )
        )
    return ProjectListResponse(projects=projects)

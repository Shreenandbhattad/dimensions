from __future__ import annotations

import threading
from collections import defaultdict
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from app.models.entities import AuditEvent, ContextBuilding, Export, Job, Site, Variant
from app.schemas.common import JobStatus


def utc_now() -> datetime:
    return datetime.now(UTC)


class InMemoryStore:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self.sites: dict[UUID, Site] = {}
        self.context_buildings: dict[UUID, list[ContextBuilding]] = defaultdict(list)
        self.jobs: dict[UUID, Job] = {}
        self.variants: dict[UUID, Variant] = {}
        self.site_variants: dict[UUID, list[UUID]] = defaultdict(list)
        self.exports: dict[UUID, Export] = {}
        self.audit_events: dict[UUID, AuditEvent] = {}

    def create_site(self, site: Site) -> Site:
        with self._lock:
            self.sites[site.id] = site
            return site

    def get_site(self, site_id: UUID) -> Site | None:
        return self.sites.get(site_id)

    def list_sites(self) -> list[Site]:
        with self._lock:
            return sorted(self.sites.values(), key=lambda s: s.updated_at, reverse=True)

    def update_site(self, site_id: UUID, **updates: Any) -> Site | None:
        with self._lock:
            site = self.sites.get(site_id)
            if site is None:
                return None
            for key, value in updates.items():
                setattr(site, key, value)
            site.updated_at = utc_now()
            return site

    def replace_context_buildings(self, site_id: UUID, buildings: list[ContextBuilding]) -> None:
        with self._lock:
            self.context_buildings[site_id] = buildings

    def list_context_buildings(self, site_id: UUID) -> list[ContextBuilding]:
        with self._lock:
            return list(self.context_buildings.get(site_id, []))

    def create_job(self, job: Job) -> Job:
        with self._lock:
            self.jobs[job.id] = job
            return job

    def get_job(self, job_id: UUID) -> Job | None:
        return self.jobs.get(job_id)

    def update_job(
        self,
        job_id: UUID,
        *,
        status: JobStatus | None = None,
        progress: int | None = None,
        result: dict[str, Any] | None = None,
        error: str | None = None,
    ) -> Job | None:
        with self._lock:
            job = self.jobs.get(job_id)
            if job is None:
                return None
            if status is not None:
                job.status = status
            if progress is not None:
                job.progress = progress
            if result is not None:
                job.result = result
            if error is not None:
                job.error = error
            job.updated_at = utc_now()
            return job

    def create_variant(self, variant: Variant) -> Variant:
        with self._lock:
            self.variants[variant.id] = variant
            self.site_variants[variant.site_id].append(variant.id)
            return variant

    def get_variant(self, variant_id: UUID) -> Variant | None:
        return self.variants.get(variant_id)

    def list_variants_for_site(self, site_id: UUID) -> list[Variant]:
        with self._lock:
            ids = self.site_variants.get(site_id, [])
            return [self.variants[v_id] for v_id in ids if v_id in self.variants]

    def update_variant(self, variant_id: UUID, **updates: Any) -> Variant | None:
        with self._lock:
            variant = self.variants.get(variant_id)
            if variant is None:
                return None
            for key, value in updates.items():
                setattr(variant, key, value)
            return variant

    def create_export(self, export: Export) -> Export:
        with self._lock:
            self.exports[export.id] = export
            return export

    def update_export(self, export_id: UUID, **updates: Any) -> Export | None:
        with self._lock:
            export = self.exports.get(export_id)
            if export is None:
                return None
            for key, value in updates.items():
                setattr(export, key, value)
            return export

    def create_audit_event(self, event: AuditEvent) -> AuditEvent:
        with self._lock:
            self.audit_events[event.id] = event
            return event

    def variant_count_by_site(self, site_id: UUID) -> int:
        return len(self.site_variants.get(site_id, []))

    def clear(self) -> None:
        with self._lock:
            self.sites.clear()
            self.context_buildings.clear()
            self.jobs.clear()
            self.variants.clear()
            self.site_variants.clear()
            self.exports.clear()
            self.audit_events.clear()

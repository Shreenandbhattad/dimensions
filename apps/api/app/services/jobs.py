from __future__ import annotations

import time
from datetime import UTC, datetime
from uuid import UUID

from app.core.presets import CITY_PRESETS
from app.models.entities import AuditEvent, Export, Variant
from app.repositories.store import InMemoryStore
from app.schemas.common import JobStatus, ZoningConstraints
from app.services.context_ingestion import ingest_site_context
from app.services.exporters import export_gltf, export_ifc_stub
from app.services.generation import GenerationError, generate_variants
from app.services.scoring import score_variant
from app.services.storage import storage


def _utc_now() -> datetime:
    return datetime.now(UTC)


async def run_context_ingestion_job(job_id: UUID, store: InMemoryStore) -> None:
    job = store.get_job(job_id)
    if job is None:
        raise ValueError(f"Job {job_id} not found")
    if job.site_id is None:
        raise ValueError("Context ingestion job requires site_id")

    store.update_job(job_id, status=JobStatus.RUNNING, progress=5)
    try:
        result = await ingest_site_context(job.site_id, store)
        store.update_job(job_id, status=JobStatus.COMPLETE, progress=100, result=result)
        store.create_audit_event(
            AuditEvent(
                site_id=job.site_id,
                event_type="context_ingested",
                event_payload=result,
            )
        )
    except Exception as exc:
        store.update_job(
            job_id,
            status=JobStatus.FAILED,
            progress=100,
            error=str(exc),
            result={},
        )


def run_variant_generation_job(job_id: UUID, store: InMemoryStore) -> None:
    job = store.get_job(job_id)
    if job is None:
        raise ValueError(f"Job {job_id} not found")
    if job.site_id is None:
        raise ValueError("Variant generation job requires site_id")

    site = store.get_site(job.site_id)
    if site is None:
        store.update_job(job_id, status=JobStatus.FAILED, progress=100, error="Site not found")
        return

    store.update_job(job_id, status=JobStatus.RUNNING, progress=10)
    payload = job.payload
    try:
        zoning = ZoningConstraints(**payload["zoning_constraints"])
        num_variants = int(payload.get("num_variants", 6))
        seed = int(payload.get("seed", 42))
    except Exception as exc:
        store.update_job(job_id, status=JobStatus.FAILED, progress=100, error=f"Invalid payload: {exc}")
        return

    context_buildings = store.list_context_buildings(site.id)
    preset = CITY_PRESETS.get(site.city_code.upper(), CITY_PRESETS["MUMBAI"])
    cost_per_sqm = float(preset["cost_per_sqm"]["concrete"])

    try:
        generated = generate_variants(
            site_id=site.id,
            site_polygon_geojson=site.polygon_geojson,
            zoning=zoning,
            num_variants=num_variants,
            seed=seed,
        )
        created_variant_ids: list[str] = []
        result_payload: dict[str, object] = {
            "site_id": str(site.id),
            "variant_ids": created_variant_ids,
            "generated_count": 0,
            "target_count": len(generated),
        }
        store.update_job(job_id, status=JobStatus.RUNNING, progress=15, result=result_payload)
        for index, item in enumerate(generated):
            scores = score_variant(
                site_polygon_geojson=site.polygon_geojson,
                massing_params=item["massing_params"],
                metrics=item["metrics"],
                context_buildings=context_buildings,
                max_far=zoning.far,
                cost_per_sqm=cost_per_sqm,
            )
            variant = Variant(
                site_id=site.id,
                generation_run_id=UUID(item["generation_run_id"]),
                typology=item["typology"],
                massing_params=item["massing_params"],
                scores=scores,
                compliance_flags=item["compliance_flags"],
            )
            gltf_key = export_gltf(
                site_id=site.id,
                variant_id=variant.id,
                massing_params=variant.massing_params,
                scores=variant.scores,
                compliance_flags=variant.compliance_flags,
            )
            variant.gltf_s3_key = gltf_key
            store.create_variant(variant)
            created_variant_ids.append(str(variant.id))
            progress = min(95, 20 + int((index + 1) * 70 / max(len(generated), 1)))
            result_payload = {
                "site_id": str(site.id),
                "variant_ids": created_variant_ids.copy(),
                "generated_count": len(created_variant_ids),
                "target_count": len(generated),
                "latest_variant_id": str(variant.id),
                "latest_index": index,
                "generation_run_id": str(variant.generation_run_id),
            }
            store.update_job(job_id, status=JobStatus.RUNNING, progress=progress, result=result_payload)
            # Brief pacing enables progressive client-side rendering with SSE.
            time.sleep(0.12)

        store.update_job(job_id, status=JobStatus.COMPLETE, progress=100, result=result_payload)
        store.create_audit_event(
            AuditEvent(
                site_id=site.id,
                event_type="variants_generated",
                event_payload=result_payload,
            )
        )
    except GenerationError as exc:
        store.update_job(job_id, status=JobStatus.FAILED, progress=100, error=str(exc))
    except Exception as exc:  # pragma: no cover - safety net for worker stability
        store.update_job(
            job_id,
            status=JobStatus.FAILED,
            progress=100,
            error=f"Unhandled generation error: {exc}",
        )


def run_export_job(job_id: UUID, store: InMemoryStore) -> None:
    job = store.get_job(job_id)
    if job is None:
        raise ValueError(f"Job {job_id} not found")
    if job.variant_id is None:
        raise ValueError("Export job requires variant_id")

    variant = store.get_variant(job.variant_id)
    if variant is None:
        store.update_job(job_id, status=JobStatus.FAILED, progress=100, error="Variant not found")
        return

    format_name = str(job.payload.get("format", "ifc")).lower()
    site_id = variant.site_id

    store.update_job(job_id, status=JobStatus.RUNNING, progress=25)
    export = Export(variant_id=variant.id, format=format_name)
    store.create_export(export)

    if format_name == "ifc":
        key = export_ifc_stub(
            site_id=site_id,
            variant_id=variant.id,
            massing_params=variant.massing_params,
            scores=variant.scores,
        )
        store.update_variant(variant.id, ifc_s3_key=key, is_exported=True)
    else:
        key = variant.gltf_s3_key or export_gltf(
            site_id=site_id,
            variant_id=variant.id,
            massing_params=variant.massing_params,
            scores=variant.scores,
            compliance_flags=variant.compliance_flags,
        )
        store.update_variant(variant.id, gltf_s3_key=key, is_exported=True)

    url = storage.get_presigned_url(key)
    store.update_export(
        export.id,
        status=JobStatus.COMPLETE,
        s3_key=key,
        download_url=url,
        completed_at=_utc_now(),
    )
    store.update_job(
        job_id,
        status=JobStatus.COMPLETE,
        progress=100,
        result={
            "export_id": str(export.id),
            "variant_id": str(variant.id),
            "format": format_name,
            "url": url,
        },
    )
    store.create_audit_event(
        AuditEvent(
            site_id=site_id,
            variant_id=variant.id,
            event_type="variant_exported",
            event_payload={"format": format_name, "url": url},
        )
    )

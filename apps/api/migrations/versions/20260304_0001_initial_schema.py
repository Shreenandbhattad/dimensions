"""initial schema

Revision ID: 20260304_0001
Revises:
Create Date: 2026-03-04
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from geoalchemy2 import Geometry
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "20260304_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")

    op.create_table(
        "sites",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("city_code", sa.String(length=32), nullable=False, server_default="MUMBAI"),
        sa.Column("site_polygon", Geometry("POLYGON", srid=4326), nullable=False),
        sa.Column("bbox", Geometry("POLYGON", srid=4326), nullable=False),
        sa.Column("local_crs_origin", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("context_ingested_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("context_s3_key", sa.String(length=512), nullable=True),
        sa.Column(
            "zoning_constraints",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_sites_site_polygon", "sites", ["site_polygon"], postgresql_using="gist")
    op.create_index("ix_sites_bbox", "sites", ["bbox"], postgresql_using="gist")
    op.create_index("ix_sites_city_code", "sites", ["city_code"])

    op.create_table(
        "context_buildings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "site_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("sites.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("osm_id", sa.BigInteger(), nullable=False),
        sa.Column("footprint", Geometry("POLYGON", srid=4326), nullable=False),
        sa.Column("height_m", sa.Float(), nullable=False),
        sa.Column("storeys", sa.Integer(), nullable=True),
        sa.Column("building_type", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_context_buildings_footprint", "context_buildings", ["footprint"], postgresql_using="gist")
    op.create_index("ix_context_buildings_site_osm", "context_buildings", ["site_id", "osm_id"], unique=True)

    op.create_table(
        "variants",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "site_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("sites.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("generation_run_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("typology", sa.String(length=50), nullable=False),
        sa.Column("massing_params", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("gltf_s3_key", sa.String(length=512), nullable=True),
        sa.Column("ifc_s3_key", sa.String(length=512), nullable=True),
        sa.Column("scores", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("compliance_flags", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("is_exported", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_variants_site_id", "variants", ["site_id"])
    op.create_index("ix_variants_generation_run_id", "variants", ["generation_run_id"])

    op.create_table(
        "jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "site_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("sites.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "variant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("variants.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("job_type", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="queued"),
        sa.Column("progress", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "payload",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "result",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_jobs_status", "jobs", ["status"])
    op.create_index("ix_jobs_job_type", "jobs", ["job_type"])
    op.create_index("ix_jobs_site_id", "jobs", ["site_id"])
    op.create_index("ix_jobs_variant_id", "jobs", ["variant_id"])

    op.create_table(
        "exports",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "variant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("variants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("format", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="queued"),
        sa.Column("s3_key", sa.String(length=512), nullable=True),
        sa.Column("download_url", sa.String(length=2048), nullable=True),
        sa.Column("requested_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_exports_variant_id", "exports", ["variant_id"])

    op.create_table(
        "audit_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "site_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("sites.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "variant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("variants.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("event_type", sa.String(length=128), nullable=False),
        sa.Column(
            "event_payload",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_audit_events_event_type", "audit_events", ["event_type"])
    op.create_index("ix_audit_events_site_id", "audit_events", ["site_id"])
    op.create_index("ix_audit_events_variant_id", "audit_events", ["variant_id"])


def downgrade() -> None:
    op.drop_index("ix_audit_events_variant_id", table_name="audit_events")
    op.drop_index("ix_audit_events_site_id", table_name="audit_events")
    op.drop_index("ix_audit_events_event_type", table_name="audit_events")
    op.drop_table("audit_events")

    op.drop_index("ix_exports_variant_id", table_name="exports")
    op.drop_table("exports")

    op.drop_index("ix_jobs_variant_id", table_name="jobs")
    op.drop_index("ix_jobs_site_id", table_name="jobs")
    op.drop_index("ix_jobs_job_type", table_name="jobs")
    op.drop_index("ix_jobs_status", table_name="jobs")
    op.drop_table("jobs")

    op.drop_index("ix_variants_generation_run_id", table_name="variants")
    op.drop_index("ix_variants_site_id", table_name="variants")
    op.drop_table("variants")

    op.drop_index("ix_context_buildings_site_osm", table_name="context_buildings")
    op.drop_index("ix_context_buildings_footprint", table_name="context_buildings")
    op.drop_table("context_buildings")

    op.drop_index("ix_sites_city_code", table_name="sites")
    op.drop_index("ix_sites_bbox", table_name="sites")
    op.drop_index("ix_sites_site_polygon", table_name="sites")
    op.drop_table("sites")


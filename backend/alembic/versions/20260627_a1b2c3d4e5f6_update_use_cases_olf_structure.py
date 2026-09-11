"""update_use_cases_olf_structure

Adds OLF-spec fields (uuid, created_by, last_edited_at, imported_at, log_source,
log_events) and removes the old simplified fields (log_format, template, olf_version)
that were replaced by the per-event log_events JSON array.

Revision ID: a1b2c3d4e5f6
Revises: 7a8b9c0d1e2f
Create Date: 2026-06-27 10:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a1b2c3d4e5f6"
down_revision: str | None = "7a8b9c0d1e2f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("use_cases") as batch_op:
        # Add new OLF-spec columns
        batch_op.add_column(
            sa.Column(
                "uuid",
                sa.String(length=36),
                nullable=False,
                server_default="",
            )
        )
        batch_op.add_column(
            sa.Column("created_by", sa.String(length=255), nullable=False, server_default="")
        )
        batch_op.add_column(
            sa.Column(
                "last_edited_at",
                sa.DateTime(),
                nullable=False,
                server_default=sa.text("(CURRENT_TIMESTAMP)"),
            )
        )
        batch_op.add_column(sa.Column("imported_at", sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column("log_source", sa.JSON(), nullable=True))
        batch_op.add_column(
            sa.Column("log_events", sa.JSON(), nullable=False, server_default="[]")
        )

        # Remove old simplified fields replaced by log_events
        batch_op.drop_column("log_format")
        batch_op.drop_column("template")
        batch_op.drop_column("olf_version")

        # Change name column max length to 120 (OLF spec)
        batch_op.alter_column(
            "name",
            type_=sa.String(length=120),
            existing_type=sa.String(length=255),
            existing_nullable=False,
        )

    # Add unique constraint on uuid (SQLite batch mode handles this separately)
    with op.batch_alter_table("use_cases") as batch_op:
        batch_op.create_unique_constraint("uq_use_cases_uuid", ["uuid"])


def downgrade() -> None:
    with op.batch_alter_table("use_cases") as batch_op:
        batch_op.drop_constraint("uq_use_cases_uuid", type_="unique")
        batch_op.drop_column("log_events")
        batch_op.drop_column("log_source")
        batch_op.drop_column("imported_at")
        batch_op.drop_column("last_edited_at")
        batch_op.drop_column("created_by")
        batch_op.drop_column("uuid")
        batch_op.add_column(
            sa.Column("olf_version", sa.String(length=20), nullable=False, server_default="1.0")
        )
        batch_op.add_column(
            sa.Column("template", sa.Text(), nullable=False, server_default="")
        )
        batch_op.add_column(
            sa.Column(
                "log_format", sa.String(length=50), nullable=False, server_default="custom"
            )
        )
        batch_op.alter_column(
            "name",
            type_=sa.String(length=255),
            existing_type=sa.String(length=120),
            existing_nullable=False,
        )

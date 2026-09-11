"""add_run_count_interval_to_use_cases

Adds run_count and run_delay_ms to use_cases so each use case carries
its own repeat/timing parameters for correlation rule tuning.

Revision ID: c9d0e1f2a3b4
Revises: b8c9d0e1f2a3
Create Date: 2026-07-04 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "c9d0e1f2a3b4"
down_revision: str | None = "b8c9d0e1f2a3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("use_cases") as batch_op:
        batch_op.add_column(
            sa.Column("run_count", sa.Integer(), nullable=False, server_default="1")
        )
        batch_op.add_column(
            sa.Column("run_delay_ms", sa.Integer(), nullable=False, server_default="1")
        )


def downgrade() -> None:
    with op.batch_alter_table("use_cases") as batch_op:
        batch_op.drop_column("run_delay_ms")
        batch_op.drop_column("run_count")

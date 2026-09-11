"""add category, drop visibility on object_groups

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-06-28 10:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "f6a7b8c9d0e1"
down_revision: str | None = "e5f6a7b8c9d0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()
    existing_cols = {col["name"] for col in sa.inspect(conn).get_columns("object_groups")}

    if "category" not in existing_cols:
        op.add_column(
            "object_groups",
            sa.Column("category", sa.String(60), nullable=False, server_default=""),
        )

    if "visibility" in existing_cols:
        with op.batch_alter_table("object_groups") as batch_op:
            batch_op.drop_column("visibility")


def downgrade() -> None:
    with op.batch_alter_table("object_groups") as batch_op:
        batch_op.add_column(
            sa.Column("visibility", sa.String(20), nullable=False, server_default="private")
        )

    conn = op.get_bind()
    existing_cols = {col["name"] for col in sa.inspect(conn).get_columns("object_groups")}
    if "category" in existing_cols:
        with op.batch_alter_table("object_groups") as batch_op:
            batch_op.drop_column("category")

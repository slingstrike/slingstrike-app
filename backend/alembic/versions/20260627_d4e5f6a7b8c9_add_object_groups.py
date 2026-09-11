"""add object_groups table

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-06-27 14:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "d4e5f6a7b8c9"
down_revision: str | None = "c3d4e5f6a7b8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if "object_groups" not in inspector.get_table_names():
        op.create_table(
            "object_groups",
            sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
            sa.Column("name", sa.String(120), nullable=False, unique=True),
            sa.Column("description", sa.Text, nullable=False, server_default=""),
            sa.Column("type", sa.String(20), nullable=False, server_default="string"),
            sa.Column("values", sa.JSON, nullable=False, server_default="[]"),
            sa.Column("visibility", sa.String(20), nullable=False, server_default="private"),
            sa.Column(
                "created_at",
                sa.DateTime,
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.Column(
                "updated_at",
                sa.DateTime,
                nullable=False,
                server_default=sa.func.now(),
            ),
        )


def downgrade() -> None:
    op.drop_table("object_groups")

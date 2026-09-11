"""add user_variables table

Revision ID: b8c9d0e1f2a3
Revises: f6a7b8c9d0e1
Create Date: 2026-06-29 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b8c9d0e1f2a3"
down_revision: str | None = "f6a7b8c9d0e1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if "user_variables" not in inspector.get_table_names():
        op.create_table(
            "user_variables",
            sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
            sa.Column("name", sa.String(120), nullable=False, unique=True),
            sa.Column("placeholder", sa.String(120), nullable=False, unique=True),
            sa.Column("description", sa.Text, nullable=False, server_default=""),
            sa.Column("type", sa.String(30), nullable=False),
            sa.Column("category", sa.String(60), nullable=False, server_default=""),
            sa.Column("params", sa.JSON, nullable=False, server_default="{}"),
            sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        )


def downgrade() -> None:
    op.drop_table("user_variables")

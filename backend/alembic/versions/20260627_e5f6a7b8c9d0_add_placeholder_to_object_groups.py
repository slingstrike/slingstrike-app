"""add placeholder to object_groups

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-06-27 15:00:00.000000
"""

import re
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "e5f6a7b8c9d0"
down_revision: str | None = "d4e5f6a7b8c9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")
    return slug or "object"


def upgrade() -> None:
    conn = op.get_bind()
    existing_cols = {col["name"] for col in sa.inspect(conn).get_columns("object_groups")}
    if "placeholder" not in existing_cols:
        # Add without unique=True - SQLite cannot add constraints via ALTER TABLE
        op.add_column(
            "object_groups",
            sa.Column("placeholder", sa.String(120), nullable=True),
        )
        # Back-fill placeholder for any existing rows
        rows = conn.execute(sa.text("SELECT id, name FROM object_groups")).fetchall()
        used: set[str] = set()
        for row_id, name in rows:
            base = _slugify(name)
            placeholder = base
            n = 2
            while placeholder in used:
                placeholder = f"{base}_{n}"
                n += 1
            used.add(placeholder)
            conn.execute(
                sa.text("UPDATE object_groups SET placeholder = :p WHERE id = :id"),
                {"p": placeholder, "id": row_id},
            )
        # Unique index is SQLite-safe alternative to a unique constraint
        existing_indexes = {idx["name"] for idx in sa.inspect(conn).get_indexes("object_groups")}
        if "ix_object_groups_placeholder" not in existing_indexes:
            op.create_index(
                "ix_object_groups_placeholder", "object_groups", ["placeholder"], unique=True
            )


def downgrade() -> None:
    op.drop_index("ix_object_groups_placeholder", table_name="object_groups")
    op.drop_column("object_groups", "placeholder")

"""add_visibility_uuid_to_destination_profiles

Adds uuid (nullable, unique - only seeded library profiles carry a uuid) and
visibility ('private' | 'public_readonly') to destination_profiles. Existing
user-created rows default to visibility='private', uuid=NULL.

Revision ID: c3d4e5f6a7b8
Revises: a1b2c3d4e5f6
Create Date: 2026-06-27 12:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "c3d4e5f6a7b8"
down_revision: str | None = "a1b2c3d4e5f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()
    existing = {col["name"] for col in sa.inspect(conn).get_columns("destination_profiles")}
    with op.batch_alter_table("destination_profiles") as batch_op:
        if "uuid" not in existing:
            batch_op.add_column(sa.Column("uuid", sa.String(36), nullable=True))
        if "visibility" not in existing:
            batch_op.add_column(
                sa.Column(
                    "visibility",
                    sa.String(20),
                    nullable=False,
                    server_default="private",
                )
            )
        if "uuid" not in existing:
            batch_op.create_unique_constraint("uq_destination_profiles_uuid", ["uuid"])


def downgrade() -> None:
    with op.batch_alter_table("destination_profiles") as batch_op:
        batch_op.drop_column("visibility")
        batch_op.drop_column("uuid")

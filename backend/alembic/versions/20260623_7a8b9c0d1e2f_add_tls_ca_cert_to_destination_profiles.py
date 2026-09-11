"""add_tls_ca_cert_to_destination_profiles

Revision ID: 7a8b9c0d1e2f
Revises: 9f3e2b1c4d7a
Create Date: 2026-06-23 14:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "7a8b9c0d1e2f"
down_revision: str | None = "9f3e2b1c4d7a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("destination_profiles", sa.Column("tls_ca_cert", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("destination_profiles", "tls_ca_cert")

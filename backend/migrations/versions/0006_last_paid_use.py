"""When an account last used paid time: a pack bought before then can't be refunded.

Revision ID: 0006
Revises: 0005
Create Date: 2026-11-01
"""

import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("accounts", sa.Column("last_paid_use_at", sa.DateTime, nullable=True))


def downgrade() -> None:
    op.drop_column("accounts", "last_paid_use_at")

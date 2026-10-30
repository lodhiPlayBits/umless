"""Index takes by user and date, for listing them across questions (GET /api/takes).

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-30
"""

from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index("ix_takes_user_id_created_at", "takes", ["user_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_takes_user_id_created_at", table_name="takes")

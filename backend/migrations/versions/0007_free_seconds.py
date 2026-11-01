"""Free time in seconds: the free trial is 90 minutes of time, not 3 transcriptions.

Each free transcription still left becomes 30 minutes (1800 s). free_transcriptions_left stays
(migrations only add, so the previous release still runs after a rollback); new accounts get 0
there. It's dropped in a later release.

Revision ID: 0007
Revises: 0006
Create Date: 2026-11-01
"""

import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("accounts", sa.Column("free_seconds_left", sa.Integer, nullable=False, server_default="0"))
    op.execute("UPDATE accounts SET free_seconds_left = free_transcriptions_left * 1800")


def downgrade() -> None:
    op.drop_column("accounts", "free_seconds_left")

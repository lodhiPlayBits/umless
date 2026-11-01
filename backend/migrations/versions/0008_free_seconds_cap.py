"""The free trial is 20 minutes (it was 90 for under an hour): trim unused free time above it.

Data only. Accounts with less than 20 minutes left keep what they have.

Revision ID: 0008
Revises: 0007
Create Date: 2026-11-01
"""

from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("UPDATE accounts SET free_seconds_left = LEAST(free_seconds_left, 1200)")


def downgrade() -> None:
    pass  # trimmed free time isn't restored

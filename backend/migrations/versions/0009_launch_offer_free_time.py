"""Launch offer: every existing account gets up to 60 free minutes (owner's decision, 2026-11-03).

Data only, once. An account with more than 60 minutes keeps what it has, which can't happen
today: free time starts at 20 minutes (migration 0008 capped it). Paid time is untouched. Ending
the offer later doesn't take these minutes back (nothing here is reversed).

Revision ID: 0009
Revises: 0008
Create Date: 2026-11-03
"""

from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("UPDATE accounts SET free_seconds_left = GREATEST(free_seconds_left, 3600)")


def downgrade() -> None:
    pass  # topped-up free time isn't taken back

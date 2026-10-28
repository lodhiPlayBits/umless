"""Create accounts (practice time balances) and payment_orders (Razorpay orders).

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-25
"""

import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "accounts",
        sa.Column("user_id", sa.String(255), primary_key=True),
        sa.Column("free_transcriptions_left", sa.Integer, nullable=False),
        sa.Column("seconds_left", sa.Integer, nullable=False),
        sa.Column("created_at", sa.DateTime, nullable=False),
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_bin",
    )
    op.create_table(
        "payment_orders",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("user_id", sa.String(255), nullable=False),
        sa.Column("pack_id", sa.String(32), nullable=False),
        sa.Column("amount_paise", sa.Integer, nullable=False),
        sa.Column("seconds", sa.Integer, nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("payment_id", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("paid_at", sa.DateTime, nullable=True),
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_bin",
    )
    op.create_index("ix_payment_orders_user_id", "payment_orders", ["user_id"])


def downgrade() -> None:
    op.drop_table("payment_orders")
    op.drop_table("accounts")

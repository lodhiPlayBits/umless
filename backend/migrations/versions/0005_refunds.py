"""Refunds: Razorpay's refund id and when the refund went through, on payment orders.

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-31
"""

import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("payment_orders", sa.Column("refund_id", sa.String(64), nullable=True))
    op.add_column("payment_orders", sa.Column("refunded_at", sa.DateTime, nullable=True))
    # The webhook finds the order of a refund by its payment id.
    op.create_index("ix_payment_orders_payment_id", "payment_orders", ["payment_id"])


def downgrade() -> None:
    op.drop_index("ix_payment_orders_payment_id", table_name="payment_orders")
    op.drop_column("payment_orders", "refunded_at")
    op.drop_column("payment_orders", "refund_id")

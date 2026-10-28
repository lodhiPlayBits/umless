"""Create the questions table: one ordered list per user.

Revision ID: 0001
Revises:
Create Date: 2026-10-25
"""

import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "questions",
        sa.Column("id", sa.CHAR(36), primary_key=True),
        sa.Column("user_id", sa.String(255), nullable=False),
        sa.Column("position", sa.Integer, nullable=False),
        sa.Column("text", sa.String(500), nullable=False),
        sa.Column("created_at", sa.DateTime, nullable=False),
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_bin",
    )
    op.create_index("ix_questions_user_id_position", "questions", ["user_id", "position"])


def downgrade() -> None:
    op.drop_table("questions")

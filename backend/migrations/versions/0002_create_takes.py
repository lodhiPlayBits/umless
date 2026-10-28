"""Create the takes table: each user's saved transcripts, per question.

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-25
"""

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "takes",
        sa.Column("id", sa.CHAR(36), primary_key=True),
        sa.Column("user_id", sa.String(255), nullable=False),
        sa.Column("question_id", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("duration_seconds", sa.Float, nullable=True),
        sa.Column("summary", sa.JSON, nullable=False),
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_bin",
    )
    op.create_index(
        "ix_takes_user_id_question_id_created_at", "takes", ["user_id", "question_id", "created_at"]
    )


def downgrade() -> None:
    op.drop_table("takes")

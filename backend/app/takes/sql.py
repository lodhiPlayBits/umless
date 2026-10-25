"""Take records in MySQL, one history per user."""

# Postponed annotations: the method named `list` would otherwise shadow the builtin.
from __future__ import annotations

from datetime import datetime

from sqlalchemy import CHAR, JSON, Column, DateTime, Engine, Float, Index, String, Table, delete, insert, select

from app.db import metadata
from app.takes.domain import Take

CREATED_AT_FORMAT = "%Y-%m-%dT%H:%M:%SZ"

# Binary collation, as for questions: ids are compared exactly.
takes = Table(
    "takes",
    metadata,
    Column("id", CHAR(36), primary_key=True),
    Column("user_id", String(255), nullable=False),
    # No foreign key: deleting a question deletes its takes in app code, objects included.
    Column("question_id", String(64), nullable=False),
    Column("created_at", DateTime, nullable=False),  # UTC
    Column("duration_seconds", Float, nullable=True),
    Column("summary", JSON, nullable=False),
    Index("ix_takes_user_id_question_id_created_at", "user_id", "question_id", "created_at"),
    mysql_charset="utf8mb4",
    mysql_collate="utf8mb4_bin",
)


class SqlTakeStore:
    def __init__(self, engine: Engine) -> None:
        self._engine = engine

    def for_user(self, user_id: str) -> SqlTakeRepository:
        return SqlTakeRepository(self._engine, user_id)


class SqlTakeRepository:
    def __init__(self, engine: Engine, user_id: str) -> None:
        self._engine = engine
        self._user_id = user_id
        self._owned = takes.c.user_id == user_id

    def list(self, question_id: str) -> list[Take]:
        query = (
            select(takes)
            .where(self._owned, takes.c.question_id == question_id)
            .order_by(takes.c.created_at.desc(), takes.c.id)
        )
        with self._engine.connect() as conn:
            return [_take(row) for row in conn.execute(query)]

    def get(self, id: str) -> Take | None:
        with self._engine.connect() as conn:
            row = conn.execute(select(takes).where(self._owned, takes.c.id == id)).first()
        return _take(row) if row else None

    def add(self, take: Take) -> None:
        with self._engine.begin() as conn:
            conn.execute(
                insert(takes).values(
                    id=take.id,
                    user_id=self._user_id,
                    question_id=take.question_id,
                    created_at=datetime.strptime(take.created_at, CREATED_AT_FORMAT),
                    duration_seconds=take.duration_seconds,
                    summary=take.summary,
                )
            )

    def delete(self, id: str) -> bool:
        with self._engine.begin() as conn:
            result = conn.execute(delete(takes).where(self._owned, takes.c.id == id))
        return result.rowcount > 0


def _take(row) -> Take:
    return Take(
        id=row.id,
        question_id=row.question_id,
        created_at=row.created_at.strftime(CREATED_AT_FORMAT),
        duration_seconds=row.duration_seconds,
        summary=row.summary,
    )

"""Questions in MySQL, one ordered list per user (docs/data-model.md)."""

# Postponed annotations: the method named `list` would otherwise shadow the builtin
# in the annotations that follow it.
from __future__ import annotations

import threading
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    CHAR,
    Column,
    DateTime,
    Engine,
    Index,
    Integer,
    String,
    Table,
    delete,
    func,
    insert,
    select,
    update,
)

from app.db import metadata
from app.questions.domain import MAX_TEXT_LENGTH, Question

CREATED_AT_FORMAT = "%Y-%m-%dT%H:%M:%SZ"

# Binary collation: ids are compared exactly, so user ids differing only in case never share
# a list. VARCHAR(500) counts characters, which in utf8mb4 are code points, as the domain does.
questions = Table(
    "questions",
    metadata,
    Column("id", CHAR(36), primary_key=True),
    Column("user_id", String(255), nullable=False),
    # 0-based index in the user's list, kept dense: the list order is ORDER BY position.
    Column("position", Integer, nullable=False),
    Column("text", String(MAX_TEXT_LENGTH), nullable=False),
    Column("created_at", DateTime, nullable=False),  # UTC
    Index("ix_questions_user_id_position", "user_id", "position"),
    mysql_charset="utf8mb4",
    mysql_collate="utf8mb4_bin",
)


class SqlQuestionStore:
    """Hands out each user's question list from one shared engine."""

    def __init__(self, engine: Engine) -> None:
        self._engine = engine
        # One uvicorn process: serializing writes here avoids InnoDB gap-lock deadlocks when
        # two requests insert into the same empty list at once.
        self._write_lock = threading.Lock()

    def for_user(self, user_id: str) -> SqlQuestionRepository:
        return SqlQuestionRepository(self._engine, user_id, self._write_lock)


class SqlQuestionRepository:
    """One user's questions. Every mutation is one transaction."""

    def __init__(self, engine: Engine, user_id: str, write_lock: threading.Lock) -> None:
        self._engine = engine
        self._user_id = user_id
        self._write_lock = write_lock
        self._owned = questions.c.user_id == user_id

    def list(self) -> list[Question]:
        query = select(questions).where(self._owned).order_by(questions.c.position, questions.c.id)
        with self._engine.connect() as conn:
            return [_question(row) for row in conn.execute(query)]

    def get(self, id: str) -> Question | None:
        query = select(questions).where(self._owned, questions.c.id == id)
        with self._engine.connect() as conn:
            row = conn.execute(query).first()
        return _question(row) if row else None

    def add(self, text: str, position: int | None = None) -> Question:
        created_at = datetime.now(timezone.utc).replace(microsecond=0, tzinfo=None)
        question = Question(
            id=str(uuid.uuid4()), text=text, created_at=created_at.strftime(CREATED_AT_FORMAT)
        )
        with self._write_lock, self._engine.begin() as conn:
            count = conn.scalar(
                select(func.count()).select_from(questions).where(self._owned).with_for_update()
            )
            index = count if position is None else min(position, count)
            conn.execute(
                update(questions)
                .where(self._owned, questions.c.position >= index)
                .values(position=questions.c.position + 1)
            )
            conn.execute(
                insert(questions).values(
                    id=question.id,
                    user_id=self._user_id,
                    position=index,
                    text=text,
                    created_at=created_at,
                )
            )
        return question

    def update(self, id: str, text: str) -> Question | None:
        with self._write_lock, self._engine.begin() as conn:
            row = conn.execute(
                select(questions).where(self._owned, questions.c.id == id).with_for_update()
            ).first()
            if row is None:
                return None
            conn.execute(update(questions).where(questions.c.id == id).values(text=text))
        return Question(id=row.id, text=text, created_at=row.created_at.strftime(CREATED_AT_FORMAT))

    def delete(self, id: str) -> bool:
        with self._write_lock, self._engine.begin() as conn:
            position = conn.scalar(
                select(questions.c.position)
                .where(self._owned, questions.c.id == id)
                .with_for_update()
            )
            if position is None:
                return False
            conn.execute(delete(questions).where(questions.c.id == id))
            conn.execute(
                update(questions)
                .where(self._owned, questions.c.position > position)
                .values(position=questions.c.position - 1)
            )
        return True


def _question(row) -> Question:
    return Question(id=row.id, text=row.text, created_at=row.created_at.strftime(CREATED_AT_FORMAT))

"""Take records (the rows; transcripts live in object storage, see objects.py)."""

# Postponed annotations: the method named `list` would otherwise shadow the builtin.
from __future__ import annotations

import threading
from typing import Protocol

from app.takes.domain import Take


class TakeRepository(Protocol):
    """One user's takes."""

    def list(self, question_id: str) -> list[Take]:
        """The question's takes, newest first."""
        ...

    def get(self, id: str) -> Take | None: ...

    def add(self, take: Take) -> None: ...

    def delete(self, id: str) -> bool: ...


class TakeStore(Protocol):
    def for_user(self, user_id: str) -> TakeRepository: ...


class InMemoryTakeStore:
    """Takes for local use without a database: kept until the server stops."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._takes: dict[str, tuple[str, Take]] = {}  # id -> (user id, take)

    def for_user(self, user_id: str) -> InMemoryTakeRepository:
        return InMemoryTakeRepository(self, user_id)


class InMemoryTakeRepository:
    def __init__(self, store: InMemoryTakeStore, user_id: str) -> None:
        self._store = store
        self._user_id = user_id

    def list(self, question_id: str) -> list[Take]:
        with self._store._lock:
            takes = [
                take
                for owner, take in self._store._takes.values()
                if owner == self._user_id and take.question_id == question_id
            ]
        # Insertion order breaks ties between takes created in the same second.
        return list(reversed(takes))

    def get(self, id: str) -> Take | None:
        with self._store._lock:
            owner, take = self._store._takes.get(id, (None, None))
        return take if owner == self._user_id else None

    def add(self, take: Take) -> None:
        with self._store._lock:
            self._store._takes[take.id] = (self._user_id, take)

    def delete(self, id: str) -> bool:
        with self._store._lock:
            owner, _ = self._store._takes.get(id, (None, None))
            if owner != self._user_id:
                return False
            del self._store._takes[id]
        return True

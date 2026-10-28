# Postponed annotations: the method named `list` would otherwise shadow the builtin
# in the annotations that follow it.
from __future__ import annotations

import json
import os
import threading
import time
import uuid
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Protocol

from app.questions.domain import MAX_TEXT_LENGTH, Question, trim

FILE_VERSION = 1
REPLACE_ATTEMPTS = 6  # the first try plus 5 retries on Windows PermissionError
ITEM_KEYS = {"id", "text", "created_at"}


class QuestionFileError(Exception):
    """The questions file exists but can't be used. It is never overwritten."""


class QuestionRepository(Protocol):
    def list(self) -> list[Question]: ...

    def get(self, id: str) -> Question | None: ...

    def add(self, text: str, position: int | None = None) -> Question: ...

    def update(self, id: str, text: str) -> Question | None: ...

    def delete(self, id: str) -> bool: ...


class QuestionStore(Protocol):
    """Where every user's questions live; app.state.questions holds one."""

    def for_user(self, user_id: str) -> QuestionRepository: ...


class JsonFileQuestionRepository:
    """Questions in one JSON file: loaded once, every change written through atomically.

    Changes are written to disk first and only then applied in memory, so a failed write
    leaves both unchanged.
    """

    def __init__(
        self,
        path: Path,
        *,
        replace: Callable[[Path, Path], None] = os.replace,
        retry_delay: float = 0.05,
    ) -> None:
        self._path = Path(path)
        self._replace = replace
        self._retry_delay = retry_delay
        self._lock = threading.Lock()
        self._questions = self._load()

    def for_user(self, user_id: str) -> JsonFileQuestionRepository:
        # One local list, whoever asks: the file store is for a single user on their machine.
        return self

    def list(self) -> list[Question]:
        with self._lock:
            return self._questions.copy()

    def get(self, id: str) -> Question | None:
        with self._lock:
            return self._find(self._questions, id)

    def add(self, text: str, position: int | None = None) -> Question:
        question = Question(
            id=str(uuid.uuid4()),
            text=text,
            created_at=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        )
        with self._lock:
            questions = self._questions.copy()
            index = len(questions) if position is None else min(position, len(questions))
            questions.insert(index, question)
            self._commit(questions)
        return question

    def update(self, id: str, text: str) -> Question | None:
        with self._lock:
            current = self._find(self._questions, id)
            if current is None:
                return None
            updated = Question(id=current.id, text=text, created_at=current.created_at)
            self._commit([updated if q.id == id else q for q in self._questions])
        return updated

    def delete(self, id: str) -> bool:
        with self._lock:
            if self._find(self._questions, id) is None:
                return False
            self._commit([q for q in self._questions if q.id != id])
        return True

    @staticmethod
    def _find(questions: list[Question], id: str) -> Question | None:
        return next((q for q in questions if q.id == id), None)

    def _commit(self, questions: list[Question]) -> None:
        self._write(questions)
        self._questions = questions

    def _write(self, questions: list[Question]) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self._path.with_name(self._path.name + ".tmp")
        data = {"version": FILE_VERSION, "questions": [asdict(q) for q in questions]}
        with open(tmp, "w", encoding="utf-8", newline="\n") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write("\n")
            f.flush()
            os.fsync(f.fileno())
        for attempt in range(1, REPLACE_ATTEMPTS + 1):
            try:
                self._replace(tmp, self._path)
                return
            except PermissionError:
                # Windows: antivirus or an editor can hold the file for a moment.
                if attempt == REPLACE_ATTEMPTS:
                    raise
                time.sleep(self._retry_delay * attempt)

    def _load(self) -> list[Question]:
        def invalid(reason: str) -> QuestionFileError:
            return QuestionFileError(f"Can't load questions from {self._path}: {reason}")

        try:
            raw = self._path.read_text(encoding="utf-8-sig")
        except FileNotFoundError:
            return []
        except (OSError, UnicodeDecodeError) as exc:
            raise invalid(f"{type(exc).__name__}: {exc}") from None
        try:
            data = json.loads(raw)
        except ValueError as exc:
            raise invalid(f"not valid JSON ({exc})") from None

        if not isinstance(data, dict):
            raise invalid("the top level must be an object")
        version = data.get("version")
        if type(version) is not int or version != FILE_VERSION:
            raise invalid(f"unsupported version {version!r} (expected {FILE_VERSION})")
        items = data.get("questions")
        if not isinstance(items, list):
            raise invalid('"questions" must be a list')

        questions: list[Question] = []
        seen: set[str] = set()
        for index, item in enumerate(items):
            if not (
                isinstance(item, dict)
                and set(item) == ITEM_KEYS
                and all(isinstance(item[key], str) for key in ITEM_KEYS)
            ):
                raise invalid(f"item {index} must have exactly the string fields id, text and created_at")
            try:
                # A lone surrogate (valid as a JSON escape) would make every later save fail.
                item["id"].encode("utf-8")
                item["text"].encode("utf-8")
            except UnicodeEncodeError:
                raise invalid(f"item {index} contains text that isn't valid Unicode") from None
            if item["id"] in seen:
                raise invalid(f"item {index} repeats the id {item['id']!r}")
            if len(item["text"]) > MAX_TEXT_LENGTH:
                raise invalid(f"item {index} text is longer than {MAX_TEXT_LENGTH} characters")
            if not trim(item["text"]):
                raise invalid(f"item {index} text is empty")
            seen.add(item["id"])
            questions.append(Question(**item))
        return questions

"""One user's take history: records in the take store, transcripts in object storage."""

# Postponed annotations: the method named `list` would otherwise shadow the builtin.
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone

from fastapi import Depends, Request

from app.auth import get_user_id
from app.questions.domain import Question
from app.takes.domain import Take, object_name
from app.takes.objects import StorageError, TranscriptObjects
from app.takes.repository import TakeRepository

logger = logging.getLogger(__name__)

DOCUMENT_VERSION = 1


class TakeHistory:
    def __init__(self, records: TakeRepository, objects: TranscriptObjects, user_id: str) -> None:
        self._records = records
        self._objects = objects
        self._user_id = user_id

    def save(self, question: Question, transcript: dict) -> Take:
        """Keep a transcript (the createTranscription body) as a new take of this question."""
        take = Take(
            id=str(uuid.uuid4()),
            question_id=question.id,
            created_at=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            duration_seconds=transcript["duration_seconds"],
            summary=transcript["summary"],
        )
        document = {
            "version": DOCUMENT_VERSION,
            "take_id": take.id,
            "question_id": question.id,
            # A snapshot: the question can be edited later.
            "question_text": question.text,
            "created_at": take.created_at,
            "transcript": transcript,
        }
        name = object_name(self._user_id, take.id)
        # Object first: a record never points at a transcript that was never written.
        self._objects.put(name, json.dumps(document, ensure_ascii=False).encode())
        try:
            self._records.add(take)
        except Exception:
            self._delete_object_quietly(name)
            raise
        return take

    def list(self, question_id: str) -> list[Take]:
        return self._records.list(question_id)

    def recent(self, question_id: str | None, since: datetime | None, limit: int) -> list[Take]:
        """Takes across questions, newest first (History, Dashboard). `since` may carry a time
        zone; records are kept in naive UTC."""
        if since is not None and since.tzinfo is not None:
            since = since.astimezone(timezone.utc).replace(tzinfo=None)
        return self._records.recent(question_id, since, limit)

    def transcript(self, take_id: str) -> tuple[Take, dict] | None:
        """The take and its transcript, or None if this user has no such take."""
        take = self._records.get(take_id)
        if take is None:
            return None
        data = self._objects.get(object_name(self._user_id, take.id))
        if data is None:
            raise StorageError(f"the transcript of take {take.id} is missing from the bucket")
        return take, json.loads(data)["transcript"]

    def delete(self, take_id: str) -> bool:
        take = self._records.get(take_id)
        if take is None:
            return False
        # Transcript first: if that fails the record stays, so the user can try again.
        self._objects.delete(object_name(self._user_id, take.id))
        self._records.delete(take.id)
        return True

    def delete_question(self, question_id: str) -> None:
        """Delete every take of a question that was just deleted. Failures are logged, not raised:
        the question is already gone."""
        for take in self._records.list(question_id):
            try:
                self.delete(take.id)
            except Exception:
                logger.exception("Couldn't delete take %s of deleted question %s", take.id, question_id)

    def _delete_object_quietly(self, name: str) -> None:
        try:
            self._objects.delete(name)
        except StorageError:
            logger.warning("Couldn't remove orphaned transcript %s", name)


def get_take_history(request: Request, user_id: str = Depends(get_user_id)) -> TakeHistory:
    state = request.app.state
    return TakeHistory(state.takes.for_user(user_id), state.transcripts, user_id)

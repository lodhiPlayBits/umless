"""A take: one transcribed answer to a question, kept in the user's history (docs/data-model.md)."""

from dataclasses import dataclass
from urllib.parse import quote


@dataclass(frozen=True)
class Take:
    id: str
    question_id: str
    created_at: str  # RFC 3339, UTC
    duration_seconds: float | None
    # The TranscriptSummary as returned by createTranscription; kept so lists need no download.
    summary: dict


def object_name(user_id: str, take_id: str) -> str:
    """Where the take's transcript lives in the bucket: one folder per user."""
    return f"users/{quote(user_id, safe='')}/takes/{take_id}.json"

"""Request helpers shared by the routers."""

import re
from datetime import datetime

from fastapi import Request

from app.config import Settings
from app.errors import ApiError


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def media_type(request: Request) -> str:
    """The Content-Type without parameters, lower-cased.

    "Audio/WebM; codecs=opus" -> "audio/webm".
    """
    return request.headers.get("content-type", "").split(";")[0].strip().lower()


# RFC 3339 date-time, as the contract's `format: date-time`: a T, seconds and an offset are required.
_RFC3339 = re.compile(r"^(\d{4}-\d{2}-\d{2})[Tt](\d{2}:\d{2}):(\d{2})(\.\d+)?([Zz]|[+-]\d{2}:\d{2})$")


def parse_date_time(value: str, name: str) -> datetime:
    """A query parameter that must be an RFC 3339 date-time, or a 422 validation_error.

    Stricter than pydantic, which also takes Unix timestamps ("0.5") and plain dates."""
    match = _RFC3339.match(value)
    if match:
        date, hours_minutes, seconds, fraction, offset = match.groups()
        # A leap second (":60") is valid RFC 3339; Python has no such second, so use :59.
        seconds = min(int(seconds), 59)
        offset = "+00:00" if offset in ("Z", "z") else offset
        try:
            return datetime.fromisoformat(f"{date}T{hours_minutes}:{seconds:02d}{fraction or ''}{offset}")
        except ValueError:
            pass  # e.g. February 30th
    raise ApiError(422, "validation_error", f"{name} must be a date-time like 2026-10-01T00:00:00Z.")

"""Request helpers shared by the routers."""

from fastapi import Request

from app.config import Settings


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def media_type(request: Request) -> str:
    """The Content-Type without parameters, lower-cased.

    "Audio/WebM; codecs=opus" -> "audio/webm".
    """
    return request.headers.get("content-type", "").split(";")[0].strip().lower()

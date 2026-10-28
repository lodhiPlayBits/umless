import logging
from typing import Literal

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.datastructures import Headers
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.routing import Match

logger = logging.getLogger(__name__)

# Must match the ErrorCode enum in docs/api/openapi.yaml (checked by tests/test_errors.py).
ErrorCode = Literal[
    "validation_error",
    "unsupported_media_type",
    "question_not_found",
    "take_not_found",
    "order_not_found",
    "payment_required",
    "payment_invalid",
    "payment_provider_failed",
    "payments_unavailable",
    "not_found",
    "method_not_allowed",
    "empty_audio",
    "audio_too_large",
    "unsupported_audio_type",
    "transcription_failed",
    "transcription_unavailable",
    "storage_unavailable",
    "invalid_host",
    "unauthorized",
    "internal_error",
]

ALLOWED_HOSTS = {"localhost", "127.0.0.1"}
LOCATION_PREFIXES = {"body", "query", "path", "header", "cookie"}
UNREADABLE_BODY = "The request body could not be read."
INTERNAL_ERROR = "Something went wrong on the server."


class ApiError(Exception):
    """An error with a contract code; rendered as the shared Error body."""

    def __init__(self, status_code: int, code: ErrorCode, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.code = code
        self.detail = detail


def error_response(
    status_code: int,
    code: ErrorCode,
    detail: str,
    fields: list[dict] | None = None,
    headers: dict | None = None,
) -> JSONResponse:
    body: dict = {"code": code, "detail": detail}
    if fields is not None:
        body["fields"] = fields
    return JSONResponse(body, status_code=status_code, headers=headers)


def _field_name(error: dict) -> str:
    # Invalid JSON is reported at ("body", <character offset>), which means nothing to a client.
    if error.get("type") == "json_invalid":
        return "body"
    loc = [str(part) for part in error.get("loc", ())]
    if len(loc) > 1 and loc[0] in LOCATION_PREFIXES:
        loc = loc[1:]
    return ".".join(loc) or "body"


def _allowed_methods(request: Request) -> list[str]:
    methods: set[str] = set()
    for route in request.app.router.routes:
        match, _ = route.matches(request.scope)
        if match != Match.NONE:
            methods |= getattr(route, "methods", None) or set()
    return sorted(methods)


async def _api_error(request: Request, exc: ApiError) -> JSONResponse:
    return error_response(exc.status_code, exc.code, exc.detail)


async def _http_error(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    headers = getattr(exc, "headers", None)
    if exc.status_code == 400:
        # FastAPI's only 400: a body it could not parse (e.g. JSON that isn't UTF-8).
        # App code raises ApiError instead, so its 400s never land here.
        fields = [{"field": "body", "message": UNREADABLE_BODY}]
        return error_response(400, "validation_error", UNREADABLE_BODY, fields, headers)
    if exc.status_code == 404:
        return error_response(404, "not_found", "No endpoint matches this URL.", headers=headers)
    if exc.status_code == 405:
        # Each FastAPI route has one method, so Starlette's Allow names only the route it
        # matched; list every method the path supports instead.
        headers = {**(headers or {}), "Allow": ", ".join(_allowed_methods(request))}
        return error_response(
            405, "method_not_allowed", "This method is not allowed for this URL.", headers=headers
        )
    logger.warning("Unmapped HTTP error %s: %s", exc.status_code, exc.detail)
    return error_response(exc.status_code, "internal_error", INTERNAL_ERROR, headers=headers)


async def _validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
    fields = [
        {"field": _field_name(error), "message": error.get("msg") or "Invalid value."}
        for error in exc.errors()
    ]
    return error_response(422, "validation_error", "The request is invalid.", fields)


async def _unhandled_error(request: Request, exc: Exception) -> JSONResponse:
    logger.exception(
        # %r so a decoded newline in the path can't forge log lines.
        "Unhandled error on %s %r", request.method, request.url.path, exc_info=exc
    )
    return error_response(500, "internal_error", INTERNAL_ERROR)


def add_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(ApiError, _api_error)
    # Replaces FastAPI's default handler, which is keyed on Starlette's class; fastapi's
    # HTTPException subclass reaches it through the MRO.
    app.add_exception_handler(StarletteHTTPException, _http_error)
    app.add_exception_handler(RequestValidationError, _validation_error)
    app.add_exception_handler(Exception, _unhandled_error)


class LocalHostOnlyMiddleware:
    """Rejects HTTP requests whose Host isn't localhost or 127.0.0.1 (DNS-rebinding guard).

    Modelled on Starlette's TrustedHostMiddleware, which can only answer in plain text.
    """

    def __init__(self, app) -> None:
        self.app = app

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] == "http":
            host = Headers(scope=scope).get("host", "").split(":")[0].lower()
            if host not in ALLOWED_HOSTS:
                response = error_response(400, "invalid_host", "Invalid Host header.")
                await response(scope, receive, send)
                return
        await self.app(scope, receive, send)

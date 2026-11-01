"""Error alerts through Sentry (launch roadmap, Phase 3 step 2). Off unless SENTRY_DSN is set.

Every ERROR log line and every unhandled exception becomes a Sentry event (the Sentry app can
push it to a phone); INFO and WARNING lines ride along as breadcrumbs. ERROR is used for things
that need the owner: a refused Deepgram account, a failing mailer, the daily free-time cap,
browser crashes (POST /api/client-errors) and every unhandled 500.

What leaves the server: the log message, the traceback and the request's method, path and
non-sensitive headers. Never request bodies (audio, questions, contact messages), cookies, the
Authorization header or IP addresses. Log lines name Clerk user ids, never transcript text.
"""

import logging

import sentry_sdk
from sentry_sdk.integrations.logging import LoggingIntegration

# Anything in an event's request that could hold a token or personal data.
DROPPED_REQUEST_FIELDS = ("data", "cookies", "query_string", "env")
DROPPED_HEADERS = {"authorization", "cookie", "x-razorpay-signature", "x-forwarded-for", "x-real-ip"}


def scrub(event: dict, hint: dict | None = None) -> dict:
    """before_send: strip what the SDK's own filtering might still let through."""
    request = event.get("request")
    if isinstance(request, dict):
        for name in DROPPED_REQUEST_FIELDS:
            request.pop(name, None)
        headers = request.get("headers")
        if isinstance(headers, dict):
            request["headers"] = {k: v for k, v in headers.items() if k.lower() not in DROPPED_HEADERS}
    user = event.get("user")
    if isinstance(user, dict):
        user.pop("ip_address", None)
    # Belt and braces with include_local_variables=False: no frame locals, whatever turns them on.
    for exception in (event.get("exception") or {}).get("values") or []:
        for frame in (exception.get("stacktrace") or {}).get("frames") or []:
            frame.pop("vars", None)
    return event


def start_sentry(dsn: str, environment: str, release: str | None = None, transport=None) -> None:
    """`transport` is for tests, which capture events instead of sending them."""
    sentry_sdk.init(
        dsn=dsn,
        transport=transport,
        environment=environment,
        release=release,
        # What integrations may collect (supersedes send_default_pii in sentry-sdk 2.7x).
        data_collection={
            "user_info": False,
            "cookies": {"mode": "off"},
            # A few harmless headers only: never Authorization, Cookie or the forwarded IPs.
            "http_headers": {"request": {"mode": "allowlist", "terms": ["user-agent", "content-type", "content-length"]}},
            "http_bodies": [],
            "url_query_params": {"mode": "off"},
            # Frame locals hold the raw ASGI scope (the Authorization header) and could hold
            # transcript text; tracebacks keep file, line and function names only.
            "stack_frame_variables": False,
        },
        max_request_body_size="never",
        # Errors only: no performance tracing or profiling (the free tier, and less data sent).
        traces_sample_rate=0,
        integrations=[LoggingIntegration(level=logging.INFO, event_level=logging.ERROR)],
        before_send=scrub,
        # Breadcrumbs can carry log lines: keep them few.
        max_breadcrumbs=30,
    )

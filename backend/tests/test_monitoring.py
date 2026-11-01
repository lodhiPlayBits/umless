"""Error alerts through Sentry (app/monitoring.py): what is sent, and what never is."""

import json
import logging

import pytest
import sentry_sdk
from fastapi.testclient import TestClient
from sentry_sdk.transport import Transport

from app.config import Settings
from app.main import create_app
from app.monitoring import scrub, start_sentry
from tests.auth_tokens import make_token, require_sign_in

DSN = "https://publickey@o0.ingest.sentry.io/0"
TOKEN_MARK = "SECRET-SESSION-TOKEN-MARK"


class Capture(Transport):
    def __init__(self):
        super().__init__()
        self.events = []

    def capture_envelope(self, envelope):
        for item in envelope.items:
            if item.type == "event":
                self.events.append(json.loads(item.payload.get_bytes()))


@pytest.fixture
def sent():
    transport = Capture()
    start_sentry(DSN, "test", transport=transport)
    yield transport.events
    sentry_sdk.init()  # no DSN: off again for the other tests


def flush():
    sentry_sdk.flush(timeout=2)


def test_an_error_log_line_becomes_an_event(sent):
    logging.getLogger("app.something").error("Deepgram refused the key: HTTP 401")
    logging.getLogger("app.something").warning("just a warning")
    flush()

    [event] = sent
    assert event["level"] == "error"
    assert event["logentry"]["message"] == "Deepgram refused the key: HTTP 401"
    assert event["environment"] == "test"


def test_an_unhandled_500_becomes_an_event_without_secrets(sent):
    app = require_sign_in(create_app(Settings(transcriber="fake")))

    @app.get("/api/boom-monitoring")
    def boom() -> dict:
        raise RuntimeError("kaboom")

    client = TestClient(app, base_url="http://localhost", raise_server_exceptions=False)
    token = make_token()
    response = client.get(
        "/api/boom-monitoring?session=" + TOKEN_MARK,
        headers={"Authorization": f"Bearer {token}", "Cookie": f"__session={TOKEN_MARK}", "X-Forwarded-For": "203.0.113.9"},
    )
    flush()

    assert response.status_code == 500
    assert sent, "the 500 should reach Sentry"
    raw = json.dumps(sent)
    assert "kaboom" in raw
    for secret in (token, TOKEN_MARK, "203.0.113.9"):
        assert secret not in raw


def test_a_request_body_is_never_sent(sent):
    app = create_app(Settings(transcriber="fake"))
    client = TestClient(app, base_url="http://localhost")
    body = {"kind": "render", "message": "TypeError: x", "path": "/", "stack": "BODY-MARK"}
    assert client.post("/api/client-errors", json=body).status_code == 204
    flush()

    [event] = sent  # the browser-error ERROR line
    assert "data" not in event.get("request", {})
    # The log line itself carries the report (that's the alert); the raw body isn't attached.
    assert "Browser error (render)" in event["logentry"]["formatted"]


def test_scrub_drops_bodies_cookies_queries_tokens_and_ips():
    event = {
        "request": {
            "url": "http://localhost/api/x",
            "method": "POST",
            "data": "{...}",
            "cookies": "a=b",
            "query_string": "t=1",
            "headers": {"Authorization": "Bearer x", "X-Razorpay-Signature": "s", "X-Real-IP": "1.2.3.4", "User-Agent": "ua"},
        },
        "user": {"ip_address": "1.2.3.4"},
        "exception": {"values": [{"stacktrace": {"frames": [{"function": "f", "vars": {"token": "x"}}]}}]},
    }
    scrubbed = scrub(event)
    assert scrubbed["request"] == {"url": "http://localhost/api/x", "method": "POST", "headers": {"User-Agent": "ua"}}
    assert scrubbed["user"] == {}
    assert scrubbed["exception"]["values"][0]["stacktrace"]["frames"] == [{"function": "f"}]


def test_sentry_is_off_without_a_dsn(monkeypatch):
    monkeypatch.delenv("SENTRY_DSN", raising=False)
    assert Settings.from_env(env_files=()).sentry_dsn is None


def test_the_dsn_is_read_but_not_shown(monkeypatch):
    monkeypatch.setenv("SENTRY_DSN", DSN)
    settings = Settings.from_env(env_files=())
    assert settings.sentry_dsn == DSN
    assert "publickey" not in repr(settings)

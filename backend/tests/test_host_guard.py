import json

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app, get_transcriber
from app.transcription import Transcript

INVALID_HOST = {"code": "invalid_host", "detail": "Invalid Host header."}


class RecordingTranscriber:
    def __init__(self):
        self.calls = []

    async def transcribe(self, audio, content_type):
        self.calls.append((audio, content_type))
        return Transcript(text="um", words=[], duration_seconds=None)


def make_client(transcriber=None):
    app = create_app(Settings(transcriber="fake"))
    if transcriber is not None:
        app.dependency_overrides[get_transcriber] = lambda: transcriber
    return TestClient(app, base_url="http://localhost")


@pytest.mark.parametrize(
    "host", ["localhost", "localhost:5173", "127.0.0.1", "127.0.0.1:8000", "LOCALHOST"]
)
def test_local_hosts_are_allowed(host):
    response = make_client().get("/api/health", headers={"Host": host})

    assert response.status_code == 200


@pytest.mark.parametrize(
    "host",
    ["testserver", "evil.com", "localhost.evil.com", "127.0.0.1.nip.io", "[::1]:8000", ""],
)
def test_other_hosts_are_rejected_with_invalid_host(host):
    response = make_client().get("/api/health", headers={"Host": host})

    assert response.status_code == 400
    assert response.json() == INVALID_HOST


def test_bad_host_on_unknown_path_is_invalid_host_not_404():
    response = make_client().get("/nope", headers={"Host": "evil.com"})

    assert response.status_code == 400
    assert response.json() == INVALID_HOST


def test_bad_host_never_reaches_the_transcriber():
    t = RecordingTranscriber()
    response = make_client(t).post(
        "/api/transcriptions",
        content=b"audio",
        headers={"Host": "evil.com", "Content-Type": "audio/webm"},
    )

    assert response.status_code == 400
    assert t.calls == []


@pytest.mark.anyio
async def test_missing_host_header_is_rejected_without_calling_inner_app():
    from app.errors import LocalHostOnlyMiddleware

    inner_calls, sent = [], []

    async def inner(scope, receive, send):
        inner_calls.append(scope)

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message):
        sent.append(message)

    scope = {"type": "http", "method": "GET", "path": "/api/health", "headers": []}
    await LocalHostOnlyMiddleware(inner)(scope, receive, send)

    assert inner_calls == []
    start = next(m for m in sent if m["type"] == "http.response.start")
    body = b"".join(m.get("body", b"") for m in sent if m["type"] == "http.response.body")
    assert start["status"] == 400
    assert json.loads(body) == INVALID_HOST


@pytest.mark.anyio
async def test_lifespan_scope_passes_through_to_inner_app():
    from app.errors import LocalHostOnlyMiddleware

    inner_calls = []

    async def inner(scope, receive, send):
        inner_calls.append(scope)

    scope = {"type": "lifespan"}
    await LocalHostOnlyMiddleware(inner)(scope, None, None)

    assert inner_calls == [scope]

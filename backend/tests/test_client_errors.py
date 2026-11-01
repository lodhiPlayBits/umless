"""POST /api/client-errors: browser crash reports written to the server log."""

import logging

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import CLIENT_ERRORS_PER_HOUR, create_app
from tests.auth_tokens import make_token, require_sign_in

GOOD = {
    "kind": "render",
    "message": "TypeError: x is undefined",
    "path": "/practice/abc",
    "stack": "TypeError: x is undefined\n    at Transcript (index.js:1:2)",
    "component_stack": "\n    at Transcript",
}
LOGGER = "app.client_errors.router"


def make_client(signed_in=False):
    app = create_app(Settings(transcriber="fake"))
    if signed_in:
        app = require_sign_in(app)
    return TestClient(app, base_url="http://localhost")


def report(client, body=GOOD, **kwargs):
    return client.post("/api/client-errors", json=body, **kwargs)


def test_a_report_is_logged_at_error(contract_schema, caplog):
    caplog.set_level(logging.ERROR, logger=LOGGER)
    response = report(make_client())

    assert response.status_code == 204
    contract_schema.find_operation_by_id("reportClientError").validate_response(response)
    [record] = [r for r in caplog.records if r.name == LOGGER]
    assert record.levelno == logging.ERROR
    line = record.getMessage()
    assert "Browser error (render) for local on '/practice/abc'" in line
    assert "TypeError: x is undefined" in line
    assert "at Transcript" in line


@pytest.mark.parametrize("kind", ["render", "uncaught", "rejection", "csp"])
def test_only_kind_message_and_path_are_required(kind):
    body = {"kind": kind, "message": "Error: boom", "path": "/"}
    assert report(make_client(), body).status_code == 204


def test_newlines_in_a_report_cannot_forge_log_lines(caplog):
    caplog.set_level(logging.ERROR, logger=LOGGER)
    forged = "boom\n2026-11-01T00:00:00Z INFO app.billing Credited order_x"
    report(make_client(), {**GOOD, "message": forged, "path": "/a\nb"})

    [record] = [r for r in caplog.records if r.name == LOGGER]
    assert "\n" not in record.getMessage()


@pytest.mark.parametrize(
    "change",
    [
        {"kind": "warning"},
        {"message": ""},
        {"message": "x" * 1001},
        {"path": "https://umless.in/practice"},
        {"path": "/" + "x" * 500},
        {"stack": "x" * 10001},
        {"component_stack": "x" * 10001},
        {"stack": None},
        {"extra": "field"},
    ],
)
def test_invalid_reports_are_422_and_not_logged(change, caplog):
    caplog.set_level(logging.ERROR, logger=LOGGER)
    response = report(make_client(), {**GOOD, **change})

    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"
    assert not [r for r in caplog.records if r.name == LOGGER]


def test_a_non_json_body_is_415():
    response = make_client().post("/api/client-errors", content=b"kind=render", headers={"Content-Type": "text/plain"})
    assert response.status_code == 415
    assert response.json()["code"] == "unsupported_media_type"


def test_sign_in_is_required_when_it_is_on():
    client = make_client(signed_in=True)
    assert report(client).status_code == 401
    assert report(client, headers={"Authorization": f"Bearer {make_token()}"}).status_code == 204


def test_reports_are_capped_per_user_per_hour(caplog):
    caplog.set_level(logging.ERROR, logger=LOGGER)
    client = make_client()
    for _ in range(CLIENT_ERRORS_PER_HOUR):
        assert report(client).status_code == 204

    response = report(client)
    assert response.status_code == 429
    assert response.json()["code"] == "rate_limited"
    assert len([r for r in caplog.records if r.name == LOGGER]) == CLIENT_ERRORS_PER_HOUR

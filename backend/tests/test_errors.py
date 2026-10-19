import logging
import re
import typing
from pathlib import Path

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import BaseModel

from app.config import Settings
from app.main import create_app

OPENAPI = Path(__file__).resolve().parents[2] / "docs" / "api" / "openapi.yaml"
ALLOWED_KEYS = {"code", "detail", "fields"}
# Every error code this file expects the API to emit.
CODES_SEEN = {"not_found", "method_not_allowed", "validation_error", "internal_error"}


class Item(BaseModel):
    text: str


class Items(BaseModel):
    items: list[Item]


def make_client(**kwargs):
    app = create_app(Settings(transcriber="fake"))

    @app.get("/probe")
    def probe_query(n: int) -> dict:
        return {"n": n}

    @app.post("/probe")
    def probe_body(body: Items) -> dict:
        return {"ok": True}

    @app.get("/boom-http")
    def boom_http() -> dict:
        raise HTTPException(400)

    @app.get("/boom")
    def boom() -> dict:
        raise RuntimeError("C:\\secret\\path sk-123")

    return TestClient(app, base_url="http://localhost", **kwargs)


def assert_error_shape(body):
    assert set(body) <= ALLOWED_KEYS
    assert ("fields" in body) == (body["code"] == "validation_error")


def post_json(client, content):
    return client.post("/probe", content=content, headers={"Content-Type": "application/json"})


def test_unknown_path_returns_not_found_error():
    response = make_client().get("/nope")

    assert response.status_code == 404
    assert response.json() == {"code": "not_found", "detail": "No endpoint matches this URL."}


def test_wrong_method_returns_method_not_allowed_with_allow_header():
    response = make_client().post("/api/health")

    assert response.status_code == 405
    assert response.json() == {
        "code": "method_not_allowed",
        "detail": "This method is not allowed for this URL.",
    }
    assert "GET" in response.headers["allow"]


def test_bare_http_exception_400_maps_to_unreadable_body_error():
    response = make_client().get("/boom-http")

    assert response.status_code == 400
    body = response.json()
    assert body["code"] == "validation_error"
    assert body["detail"] == "The request body could not be read."
    assert body["fields"] == [
        {"field": "body", "message": "The request body could not be read."}
    ]
    assert_error_shape(body)


def test_invalid_utf8_json_body_returns_400_validation_error():
    response = post_json(make_client(), b'{"a": "\xff"}')

    assert response.status_code == 400
    body = response.json()
    assert body["code"] == "validation_error"
    assert "body" in [f["field"] for f in body["fields"]]
    assert_error_shape(body)


def test_malformed_json_returns_422_validation_error():
    response = post_json(make_client(), b'{"items": [')

    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "validation_error"
    assert body["detail"] == "The request is invalid."
    assert "body" in [f["field"] for f in body["fields"]]
    assert_error_shape(body)


def test_nested_field_error_uses_dotted_path():
    response = post_json(make_client(), b'{"items": [{"text": 1}]}')

    assert response.status_code == 422
    body = response.json()
    assert "items.0.text" in [f["field"] for f in body["fields"]]
    assert_error_shape(body)


def test_invalid_query_parameter_is_reported_by_name():
    response = make_client().get("/probe", params={"n": "x"})

    assert response.status_code == 422
    body = response.json()
    assert "n" in [f["field"] for f in body["fields"]]
    assert_error_shape(body)


def test_unhandled_exception_returns_generic_500_and_logs(caplog):
    client = make_client(raise_server_exceptions=False)
    with caplog.at_level(logging.ERROR):
        response = client.get("/boom")

    assert response.status_code == 500
    assert response.json() == {
        "code": "internal_error",
        "detail": "Something went wrong on the server.",
    }
    for leaked in ("secret", "sk-123", "Traceback"):
        assert leaked not in response.text
    assert any(r.levelno >= logging.ERROR and r.exc_info for r in caplog.records)


@pytest.mark.parametrize("path", ["/docs", "/redoc", "/openapi.json"])
def test_generated_docs_are_disabled(path):
    response = make_client().get(path)

    assert response.status_code == 404
    assert response.json()["code"] == "not_found"


def test_error_codes_match_openapi_contract():
    from app.errors import ErrorCode

    text = OPENAPI.read_text(encoding="utf-8")
    block = re.search(r"^    ErrorCode:\s*\n.*?enum:\s*\n(.*?)description:", text, re.S | re.M)
    assert block, "ErrorCode enum not found in openapi.yaml"
    documented = set(re.findall(r"^\s*- (\w+)\s*$", block.group(1), re.M))

    assert documented
    assert documented == set(typing.get_args(ErrorCode))
    assert CODES_SEEN <= documented

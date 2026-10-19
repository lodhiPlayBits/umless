import json
import os

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.questions.repository import JsonFileQuestionRepository, QuestionFileError
from app.questions.router import get_question_repository

ALLOWED_KEYS = {"code", "detail", "fields"}
NOT_FOUND = {"code": "question_not_found", "detail": "That question doesn't exist any more."}
UNSUPPORTED = {
    "code": "unsupported_media_type",
    "detail": "Send the request body as application/json.",
}
JSON_HEADERS = {"Content-Type": "application/json"}
UUID = "123e4567-e89b-42d3-a456-426614174000"


def make_app(tmp_path):
    return create_app(Settings(transcriber="fake", data_file=tmp_path / "q.json"))


def assert_error_shape(response):
    body = response.json()
    assert set(body) <= ALLOWED_KEYS
    assert ("fields" in body) == (body["code"] == "validation_error")


def field_names(response):
    return [f["field"] for f in response.json()["fields"]]


def create(client, text, **extra):
    response = client.post("/api/questions", json={"text": text, **extra})
    assert response.status_code == 201
    return response.json()


def listed(client):
    return client.get("/api/questions").json()["items"]


# --- happy paths ----------------------------------------------------------


def test_list_is_empty_initially(client):
    response = client.get("/api/questions")

    assert response.status_code == 200
    assert response.json() == {"items": []}


def test_list_returns_items_in_stored_order_with_exact_keys(client):
    for t in ("a", "b", "c"):
        create(client, t)

    items = listed(client)

    assert [i["text"] for i in items] == ["a", "b", "c"]
    assert all(set(i) == {"id", "text", "created_at"} for i in items)


def test_create_returns_201_trimmed_question_and_location_header(client):
    response = client.post("/api/questions", json={"text": "  Tell me about yourself "})

    assert response.status_code == 201
    body = response.json()
    assert set(body) == {"id", "text", "created_at"}
    assert body["text"] == "Tell me about yourself"
    assert response.headers["location"] == f"/api/questions/{body['id']}"


def test_duplicate_texts_are_allowed(client):
    a = create(client, "same")
    b = create(client, "same")

    assert a["id"] != b["id"]
    assert [i["text"] for i in listed(client)] == ["same", "same"]


def test_delete_then_recreate_at_position_restores_order(client):
    a, b, c = (create(client, t) for t in ("A", "B", "C"))

    deleted = client.delete(f"/api/questions/{b['id']}")
    assert deleted.status_code == 204
    assert deleted.content == b""

    restored = create(client, b["text"], position=1)

    items = listed(client)
    assert [i["text"] for i in items] == ["A", "B", "C"]
    assert items[1]["id"] == restored["id"] != b["id"]
    assert [items[0]["id"], items[2]["id"]] == [a["id"], c["id"]]


def test_patch_updates_text_keeping_id_created_at_and_order(client):
    a = create(client, "a")
    b = create(client, "b")
    create(client, "c")

    response = client.patch(f"/api/questions/{b['id']}", json={"text": " new "})

    assert response.status_code == 200
    assert response.json() == {"id": b["id"], "text": "new", "created_at": b["created_at"]}
    assert [i["text"] for i in listed(client)] == ["a", "new", "c"]
    assert listed(client)[0]["id"] == a["id"]


# --- media type -----------------------------------------------------------


@pytest.mark.parametrize("method", ["post", "patch"])
@pytest.mark.parametrize(
    "content_type",
    [
        None,
        "text/plain",
        "application/x-www-form-urlencoded",
        "multipart/form-data; boundary=x",
        "text/json",
        "application/merge-patch+json",
    ],
)
def test_non_json_content_type_returns_415(client, method, content_type):
    q = create(client, "a")
    url = "/api/questions" if method == "post" else f"/api/questions/{q['id']}"
    headers = {"Content-Type": content_type} if content_type else {}

    response = client.request(method.upper(), url, content=b'{"text": "x"}', headers=headers)

    assert response.status_code == 415
    assert response.json() == UNSUPPORTED
    assert [i["text"] for i in listed(client)] == ["a"]


@pytest.mark.parametrize("content_type", ["application/json; charset=utf-8", "APPLICATION/JSON"])
@pytest.mark.parametrize("method", ["post", "patch"])
def test_json_content_type_variants_are_accepted(client, method, content_type):
    q = create(client, "a")
    url = "/api/questions" if method == "post" else f"/api/questions/{q['id']}"

    response = client.request(
        method.upper(), url, content=b'{"text": "x"}', headers={"Content-Type": content_type}
    )

    assert response.status_code == (201 if method == "post" else 200)


# --- validation -----------------------------------------------------------


@pytest.mark.parametrize(
    ("payload", "field"),
    [
        ({"text": "a" * 501}, "text"),
        ({"text": ""}, "text"),
        ({"text": "  　 "}, "text"),
        ({"text": "x", "position": -1}, "position"),
        ({"text": "x", "position": "1"}, "position"),
        ({"text": "x", "bogus": 1}, "bogus"),
        ({}, "text"),
    ],
)
@pytest.mark.parametrize("method", ["post", "patch"])
def test_invalid_body_returns_422_naming_the_field(client, method, payload, field):
    q = create(client, "a")
    url = "/api/questions" if method == "post" else f"/api/questions/{q['id']}"
    if method == "patch" and field == "position":
        field = "position"  # unknown key on PATCH, still named after the key

    response = client.request(method.upper(), url, json=payload)

    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"
    assert field in field_names(response)
    assert_error_shape(response)


@pytest.mark.parametrize("method", ["post", "patch"])
@pytest.mark.parametrize("content", [None, b'{"text": '])
def test_missing_or_malformed_json_body_is_reported_on_body(client, method, content):
    q = create(client, "a")
    url = "/api/questions" if method == "post" else f"/api/questions/{q['id']}"

    response = client.request(method.upper(), url, content=content, headers=JSON_HEADERS)

    assert response.status_code == 422
    assert "body" in field_names(response)
    assert_error_shape(response)


# --- not found ------------------------------------------------------------


@pytest.mark.parametrize("method", ["patch", "delete"])
@pytest.mark.parametrize("kind", ["unknown_uuid", "not_a_uuid", "long_id", "uppercased"])
def test_unknown_id_returns_404(client, method, kind):
    q = create(client, "a")
    qid = {
        "unknown_uuid": UUID,
        "not_a_uuid": "not-a-uuid",
        "long_id": "a" * 65,
        "uppercased": q["id"].upper(),
    }[kind]
    kwargs = {"json": {"text": "x"}} if method == "patch" else {}

    response = client.request(method.upper(), f"/api/questions/{qid}", **kwargs)

    assert response.status_code == 404
    assert response.json() == NOT_FOUND
    assert [i["id"] for i in listed(client)] == [q["id"]]


def test_second_delete_of_same_id_returns_404(client):
    q = create(client, "a")
    assert client.delete(f"/api/questions/{q['id']}").status_code == 204

    response = client.delete(f"/api/questions/{q['id']}")

    assert response.status_code == 404
    assert response.json() == NOT_FOUND


# --- host guard, methods, redirects --------------------------------------


@pytest.mark.parametrize(
    ("method", "url", "kwargs"),
    [
        ("GET", "/api/questions", {}),
        ("POST", "/api/questions", {"json": {"text": "x"}}),
        ("PATCH", f"/api/questions/{UUID}", {"json": {"text": "x"}}),
        ("DELETE", f"/api/questions/{UUID}", {}),
    ],
)
def test_foreign_host_is_rejected_on_every_operation(client, method, url, kwargs):
    response = client.request(method, url, headers={"Host": "evil.com"}, **kwargs)

    assert response.status_code == 400
    assert response.json()["code"] == "invalid_host"
    assert_error_shape(response)
    assert listed(client) == []


def test_get_single_question_is_method_not_allowed(client):
    q = create(client, "a")

    response = client.get(f"/api/questions/{q['id']}")

    assert response.status_code == 405
    assert response.json()["code"] == "method_not_allowed"
    assert_error_shape(response)


def test_trailing_slash_redirects_with_307(client):
    response = client.post("/api/questions/", json={"text": "x"}, follow_redirects=False)

    assert response.status_code == 307


# --- failures and lifecycle ----------------------------------------------


def test_failing_write_returns_generic_500_and_keeps_previous_list(tmp_path):
    path = tmp_path / "q.json"
    JsonFileQuestionRepository(path).add("kept")
    failing = {"on": False}

    def replace(src, dst):
        if failing["on"]:
            raise PermissionError("locked")
        os.replace(src, dst)

    repo = JsonFileQuestionRepository(path, replace=replace, retry_delay=0)
    app = create_app(Settings(transcriber="fake", data_file=path))
    app.dependency_overrides[get_question_repository] = lambda: repo
    with TestClient(app, base_url="http://localhost", raise_server_exceptions=False) as c:
        failing["on"] = True
        response = c.post("/api/questions", json={"text": "new"})
        assert response.status_code == 500
        assert response.json() == {
            "code": "internal_error",
            "detail": "Something went wrong on the server.",
        }
        assert_error_shape(response)
        assert [i["text"] for i in listed(c)] == ["kept"]


def test_questions_survive_an_app_restart(tmp_path):
    with TestClient(make_app(tmp_path), base_url="http://localhost") as first:
        created = [create(first, t) for t in ("a", "b")]

    with TestClient(make_app(tmp_path), base_url="http://localhost") as second:
        assert listed(second) == created


def test_corrupt_data_file_fails_app_startup_and_is_left_untouched(tmp_path):
    path = tmp_path / "q.json"
    path.write_bytes(b"{broken")

    with pytest.raises(QuestionFileError):
        with TestClient(make_app(tmp_path), base_url="http://localhost"):
            pass

    assert path.read_bytes() == b"{broken"


def test_client_without_lifespan_cannot_serve_questions(tmp_path):
    client = TestClient(make_app(tmp_path), base_url="http://localhost")

    with pytest.raises(RuntimeError, match="(?i)lifespan"):
        client.get("/api/questions")


def test_data_file_content_matches_api_state(tmp_path):
    with TestClient(make_app(tmp_path), base_url="http://localhost") as c:
        q = create(c, "stored")

    data = json.loads((tmp_path / "q.json").read_text(encoding="utf-8"))
    assert data["questions"] == [q]

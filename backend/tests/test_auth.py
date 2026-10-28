"""Sign-in with Clerk session tokens: who may call the API, and whose questions they see."""

import time

import jwt
import pytest
from fastapi.testclient import TestClient

from app.auth import clerk_issuer
from app.config import Settings
from app.main import create_app
from tests.auth_tokens import ISSUER, OTHER_KEY, PUBLISHABLE_KEY, SITE, make_token, require_sign_in

AUDIO = b"\x00\x01fake-audio-bytes\xff"
PROTECTED = [
    ("GET", "/api/questions"),
    ("POST", "/api/questions"),
    ("PATCH", "/api/questions/3f2c8a9e-6b1d-4c0e-9a57-2d8e1f4b7c10"),
    ("DELETE", "/api/questions/3f2c8a9e-6b1d-4c0e-9a57-2d8e1f4b7c10"),
    ("POST", "/api/transcriptions"),
]
token = make_token


def bearer(value):
    return {"Authorization": f"Bearer {value}"}


def signed_in_app(settings):
    return require_sign_in(create_app(settings))


@pytest.fixture
def client(tmp_path):
    settings = Settings(transcriber="fake", data_file=tmp_path / "q.json")
    with TestClient(signed_in_app(settings), base_url="http://localhost") as c:
        yield c


def assert_unauthorized(response, contract_schema=None, operation_id=None):
    assert response.status_code == 401
    assert response.json() == {"code": "unauthorized", "detail": "Sign in to continue."}
    if contract_schema is not None:
        contract_schema.find_operation_by_id(operation_id).validate_response(response)


# --- the publishable key -----------------------------------------------------------------


def test_issuer_is_decoded_from_the_publishable_key():
    assert clerk_issuer(PUBLISHABLE_KEY) == ISSUER


@pytest.mark.parametrize(
    "key", ["", "sk_test_c3RhYmxl", "pk_test_", "pk_test_!!!", "pk_test_c3RhYmxl", "pk_prod_YSQ="]
)
def test_a_value_that_is_not_a_publishable_key_is_rejected(key):
    with pytest.raises(ValueError, match="CLERK_PUBLISHABLE_KEY"):
        clerk_issuer(key)


# --- who may call ------------------------------------------------------------------------


@pytest.mark.parametrize("method, path", PROTECTED)
def test_every_api_call_but_health_needs_a_session_token(client, method, path):
    assert_unauthorized(client.request(method, path))


def test_health_needs_no_token(client):
    assert client.get("/api/health").status_code == 200


def test_401_matches_the_contract(client, contract_schema):
    assert_unauthorized(client.get("/api/questions"), contract_schema, "listQuestions")
    assert_unauthorized(
        client.post("/api/transcriptions", content=AUDIO, headers={"Content-Type": "audio/webm"}),
        contract_schema,
        "createTranscription",
    )


def test_a_valid_token_is_let_through(client):
    response = client.post("/api/questions", json={"text": "Why this job?"}, headers=bearer(token()))

    assert response.status_code == 201


def test_transcription_works_with_a_valid_token(client):
    response = client.post(
        "/api/transcriptions",
        content=AUDIO,
        headers={"Content-Type": "audio/webm", **bearer(token())},
    )

    assert response.status_code == 200


def test_sign_in_is_checked_before_the_body(client):
    # Otherwise a caller without a token could probe validation rules.
    assert_unauthorized(client.post("/api/questions", json={"text": ""}))
    assert_unauthorized(client.post("/api/questions", content="x", headers={"Content-Type": "text/plain"}))


@pytest.mark.parametrize(
    "header",
    [
        "Bearer",
        "Bearer   ",
        "Basic dXNlcjpwYXNz",
        "Bearer not-a-jwt",
        f"Token {token()}",
    ],
)
def test_malformed_authorization_headers_are_rejected(client, header):
    assert_unauthorized(client.get("/api/questions", headers={"Authorization": header}))


@pytest.mark.parametrize(
    "bad_token",
    [
        pytest.param(token(exp=int(time.time()) - 60), id="expired"),
        pytest.param(token(nbf=int(time.time()) + 600), id="not-yet-valid"),
        pytest.param(token(iss="https://evil.clerk.accounts.dev"), id="other-issuer"),
        pytest.param(token(azp="https://evil.example"), id="other-site"),
        pytest.param(token(azp=None), id="no-azp"),
        pytest.param(token(sub=None), id="no-sub"),
        pytest.param(token(sub=""), id="empty-sub"),
        pytest.param(token(exp=None), id="no-exp"),
        pytest.param(token(key=OTHER_KEY), id="wrong-signing-key"),
        pytest.param(
            jwt.encode({"iss": ISSUER, "sub": "user_alice", "azp": SITE}, "secret", algorithm="HS256"),
            id="hs256",
        ),
        pytest.param(
            jwt.encode(
                {"iss": ISSUER, "sub": "x", "azp": SITE, "iat": 0, "exp": 2**40}, None, algorithm="none"
            ),
            id="unsigned",
        ),
    ],
)
def test_invalid_tokens_are_rejected(client, bad_token):
    assert_unauthorized(client.get("/api/questions", headers=bearer(bad_token)))


def test_a_token_a_few_seconds_past_expiry_is_still_accepted_for_clock_skew(client):
    stale = token(exp=int(time.time()) - 2)

    assert client.get("/api/questions", headers=bearer(stale)).status_code == 200


def test_without_clerk_configured_no_token_is_needed(tmp_path):
    settings = Settings(transcriber="fake", data_file=tmp_path / "q.json")
    with TestClient(create_app(settings), base_url="http://localhost") as c:
        assert c.get("/api/questions").status_code == 200


# --- whose questions ---------------------------------------------------------------------


def test_each_user_sees_only_their_own_questions(mysql_engine):
    settings = Settings(transcriber="fake", database_url=mysql_engine.url)
    alice, bob = bearer(token("user_auth_alice")), bearer(token("user_auth_bob"))
    with TestClient(signed_in_app(settings), base_url="http://localhost") as c:
        mine = c.post("/api/questions", json={"text": "Alice only"}, headers=alice).json()
        c.post("/api/questions", json={"text": "Bob only"}, headers=bob)

        assert [q["text"] for q in c.get("/api/questions", headers=alice).json()["items"]] == ["Alice only"]
        assert [q["text"] for q in c.get("/api/questions", headers=bob).json()["items"]] == ["Bob only"]
        path = f"/api/questions/{mine['id']}"
        assert c.patch(path, json={"text": "taken"}, headers=bob).json()["code"] == "question_not_found"
        assert c.delete(path, headers=bob).status_code == 404
        assert c.get("/api/questions", headers=alice).json()["items"] == [mine]


# --- settings ----------------------------------------------------------------------------


def test_settings_read_clerk_from_the_environment(monkeypatch):
    monkeypatch.setenv("CLERK_PUBLISHABLE_KEY", PUBLISHABLE_KEY)
    monkeypatch.setenv("CLERK_AUTHORIZED_PARTIES", " https://umless.in/ , http://localhost:5173")

    s = Settings.from_env(env_files=())

    assert s.clerk_issuer == ISSUER
    assert s.clerk_authorized_parties == ("https://umless.in", "http://localhost:5173")


def test_clerk_without_authorized_parties_is_refused(monkeypatch):
    monkeypatch.setenv("CLERK_PUBLISHABLE_KEY", PUBLISHABLE_KEY)
    monkeypatch.delenv("CLERK_AUTHORIZED_PARTIES", raising=False)

    with pytest.raises(ValueError, match="CLERK_AUTHORIZED_PARTIES"):
        Settings.from_env(env_files=())


def test_a_database_without_clerk_is_refused(monkeypatch):
    # One list per user needs to know who the user is; never fall back to a shared list.
    for name, value in {"DB_HOST": "db", "DB_USER": "u", "DB_PASSWORD": "p", "DB_NAME": "n"}.items():
        monkeypatch.setenv(name, value)
    monkeypatch.delenv("CLERK_PUBLISHABLE_KEY", raising=False)

    with pytest.raises(ValueError, match="CLERK_PUBLISHABLE_KEY"):
        Settings.from_env(env_files=())

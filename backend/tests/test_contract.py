"""API contract tests against docs/api/openapi.yaml.

Part 1 fuzzes every operation with Schemathesis. Parts 2-3 are explicit, one test per
(operation, status), named test_<operationId>_<status>_<what>, and validate each response
against the contract.
"""

import pytest
import schemathesis
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app, get_transcriber
from app.questions.router import get_question_repository
from app.transcription import TranscriptionError

schema = schemathesis.pytest.from_fixture("contract_schema")

AUDIO = b"\x00\x01fake-audio-bytes\xff"
MAX_AUDIO_BYTES = 26_214_400
MISSING_ID = "3f2c8a9e-6b1d-4c0e-9a57-2d8e1f4b7c10"


# --- 1. Schema-based fuzzing -------------------------------------------------------------


@schema.parametrize()
def test_fuzz_every_operation_matches_contract(case):
    case.call_and_validate()


# --- helpers -----------------------------------------------------------------------------


def validate(contract_schema, operation_id, response):
    contract_schema.find_operation_by_id(operation_id).validate_response(response)


def assert_error(response, status, code):
    assert response.status_code == status
    assert response.headers["content-type"].startswith("application/json")
    assert response.json()["code"] == code


def make_client(tmp_path, settings=None, transcriber=None, repository=None, **client_kwargs):
    app = create_app(settings or Settings(transcriber="fake", data_file=tmp_path / "q.json"))
    if transcriber is not None:
        app.dependency_overrides[get_transcriber] = lambda: transcriber
    if repository is not None:
        app.dependency_overrides[get_question_repository] = lambda: repository
    return TestClient(app, base_url="http://localhost", **client_kwargs)


def post_audio(client, body=AUDIO, content_type="audio/webm"):
    headers = {"Content-Type": content_type} if content_type is not None else {}
    return client.post("/api/transcriptions", content=body, headers=headers)


def create_question(client, text="Tell me about yourself"):
    response = client.post("/api/questions", json={"text": text})
    assert response.status_code == 201
    return response.json()


class FailingTranscriber:
    async def transcribe(self, audio, content_type):
        raise TranscriptionError("upstream failed")


class ExplodingTranscriber:
    async def transcribe(self, audio, content_type):
        raise RuntimeError("boom /secret/path")


class ExplodingRepository:
    def list(self):
        raise RuntimeError("disk on fire /secret/path")


# --- 2. Success responses ----------------------------------------------------------------


def test_getHealth_200_ok(client, contract_schema):
    response = client.get("/api/health")

    assert response.status_code == 200
    validate(contract_schema, "getHealth", response)


def test_listQuestions_200_returns_items(client, contract_schema):
    create_question(client)
    response = client.get("/api/questions")

    assert response.status_code == 200
    assert len(response.json()["items"]) == 1
    validate(contract_schema, "listQuestions", response)


def test_listQuestions_200_empty_list(client, contract_schema):
    response = client.get("/api/questions")

    assert response.status_code == 200
    assert response.json() == {"items": []}
    validate(contract_schema, "listQuestions", response)


def test_createQuestion_201_created_with_location(client, contract_schema):
    response = client.post("/api/questions", json={"text": "  Why this job?  "})

    assert response.status_code == 201
    assert response.json()["text"] == "Why this job?"
    assert response.headers["location"] == f"/api/questions/{response.json()['id']}"
    validate(contract_schema, "createQuestion", response)


def test_updateQuestion_200_returns_updated_question(client, contract_schema):
    question = create_question(client)
    response = client.patch(f"/api/questions/{question['id']}", json={"text": "New text"})

    assert response.status_code == 200
    assert response.json()["text"] == "New text"
    validate(contract_schema, "updateQuestion", response)


def test_deleteQuestion_204_no_content(client, contract_schema):
    question = create_question(client)
    response = client.delete(f"/api/questions/{question['id']}")

    assert response.status_code == 204
    assert response.content == b""
    validate(contract_schema, "deleteQuestion", response)


def test_createTranscription_200_returns_transcript(client, contract_schema):
    response = post_audio(client)

    assert response.status_code == 200
    validate(contract_schema, "createTranscription", response)


# --- 3. Error responses ------------------------------------------------------------------

INVALID_HOST_REQUESTS = {
    "getHealth": ("GET", "/api/health", {}),
    "listQuestions": ("GET", "/api/questions", {}),
    "createQuestion": ("POST", "/api/questions", {"json": {"text": "x"}}),
    "updateQuestion": ("PATCH", f"/api/questions/{MISSING_ID}", {"json": {"text": "x"}}),
    "deleteQuestion": ("DELETE", f"/api/questions/{MISSING_ID}", {}),
    "createTranscription": (
        "POST",
        "/api/transcriptions",
        {"content": AUDIO, "headers": {"Content-Type": "audio/webm"}},
    ),
}


@pytest.mark.parametrize("operation_id", list(INVALID_HOST_REQUESTS))
def test_operation_400_invalid_host(operation_id, tmp_path, contract_schema):
    method, path, kwargs = INVALID_HOST_REQUESTS[operation_id]
    kwargs = dict(kwargs)
    kwargs["headers"] = {**kwargs.get("headers", {}), "Host": "evil.example.com"}
    with make_client(tmp_path) as client:
        response = client.request(method, path, **kwargs)

    assert_error(response, 400, "invalid_host")
    validate(contract_schema, operation_id, response)


def test_createTranscription_400_empty_audio(client, contract_schema):
    response = post_audio(client, body=b"")

    assert_error(response, 400, "empty_audio")
    validate(contract_schema, "createTranscription", response)


def test_updateQuestion_404_question_not_found(client, contract_schema):
    response = client.patch(f"/api/questions/{MISSING_ID}", json={"text": "x"})

    assert_error(response, 404, "question_not_found")
    validate(contract_schema, "updateQuestion", response)


def test_deleteQuestion_404_question_not_found(client, contract_schema):
    response = client.delete(f"/api/questions/{MISSING_ID}")

    assert_error(response, 404, "question_not_found")
    validate(contract_schema, "deleteQuestion", response)


def test_createTranscription_413_audio_too_large(client, contract_schema):
    response = post_audio(client, body=b"\x00" * (MAX_AUDIO_BYTES + 1))

    assert_error(response, 413, "audio_too_large")
    validate(contract_schema, "createTranscription", response)


def test_createTranscription_415_unsupported_audio_type(client, contract_schema):
    response = post_audio(client, content_type="text/plain")

    assert_error(response, 415, "unsupported_audio_type")
    validate(contract_schema, "createTranscription", response)


def test_createTranscription_415_missing_content_type(client, contract_schema):
    response = post_audio(client, content_type=None)

    assert_error(response, 415, "unsupported_audio_type")
    validate(contract_schema, "createTranscription", response)


def test_createTranscription_502_transcription_failed(tmp_path, contract_schema):
    with make_client(tmp_path, transcriber=FailingTranscriber()) as client:
        response = post_audio(client)

    assert_error(response, 502, "transcription_failed")
    validate(contract_schema, "createTranscription", response)


def test_createTranscription_503_transcription_unavailable(tmp_path, contract_schema):
    settings = Settings(
        transcriber="deepgram", deepgram_api_key=None, data_file=tmp_path / "q.json"
    )
    with make_client(tmp_path, settings=settings) as client:
        response = post_audio(client)

    assert_error(response, 503, "transcription_unavailable")
    validate(contract_schema, "createTranscription", response)


def test_createQuestion_415_unsupported_media_type(client, contract_schema):
    response = client.post(
        "/api/questions", content="text=hi", headers={"Content-Type": "text/plain"}
    )

    assert_error(response, 415, "unsupported_media_type")
    validate(contract_schema, "createQuestion", response)


def test_updateQuestion_415_unsupported_media_type(client, contract_schema):
    question = create_question(client)
    response = client.patch(
        f"/api/questions/{question['id']}",
        content="text=hi",
        headers={"Content-Type": "text/plain"},
    )

    assert_error(response, 415, "unsupported_media_type")
    validate(contract_schema, "updateQuestion", response)


def test_createQuestion_422_validation_error(client, contract_schema):
    response = client.post("/api/questions", json={"text": "   "})

    assert_error(response, 422, "validation_error")
    assert response.json()["fields"]
    validate(contract_schema, "createQuestion", response)


def test_updateQuestion_422_validation_error(client, contract_schema):
    question = create_question(client)
    response = client.patch(f"/api/questions/{question['id']}", json={"text": "x" * 501})

    assert_error(response, 422, "validation_error")
    assert response.json()["fields"]
    validate(contract_schema, "updateQuestion", response)


def test_listQuestions_500_internal_error(tmp_path, contract_schema):
    with make_client(
        tmp_path, repository=ExplodingRepository(), raise_server_exceptions=False
    ) as client:
        response = client.get("/api/questions")

    assert_error(response, 500, "internal_error")
    assert "secret" not in response.text
    validate(contract_schema, "listQuestions", response)


def test_createTranscription_500_internal_error(tmp_path, contract_schema):
    with make_client(
        tmp_path, transcriber=ExplodingTranscriber(), raise_server_exceptions=False
    ) as client:
        response = post_audio(client)

    assert_error(response, 500, "internal_error")
    assert "secret" not in response.text
    validate(contract_schema, "createTranscription", response)

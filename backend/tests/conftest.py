from pathlib import Path

import pytest
import schemathesis
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.questions.repository import JsonFileQuestionRepository
from app.questions.router import get_question_repository

OPENAPI = Path(__file__).resolve().parents[2] / "docs" / "api" / "openapi.yaml"
AUDIO_TYPES = ("audio/webm", "audio/ogg", "audio/mp4", "audio/wav", "audio/mpeg")

# createTranscription takes raw audio bytes; send generated bodies as-is, like octet-stream.
for _media_type in AUDIO_TYPES:
    schemathesis.serializer.alias(_media_type, "application/octet-stream")


def pytest_addoption(parser):
    parser.addoption(
        "--run-live",
        action="store_true",
        default=False,
        help="run tests that call the real Deepgram API",
    )


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
def client(tmp_path):
    app = create_app(Settings(transcriber="fake", data_file=tmp_path / "q.json"))
    with TestClient(app, base_url="http://localhost") as c:
        yield c


@pytest.fixture(scope="session")
def contract_schema(tmp_path_factory):
    """docs/api/openapi.yaml bound to the app in-process, for Schemathesis contract tests.

    Fake transcriber (no Deepgram calls) and a throwaway questions file. Schemathesis doesn't
    run the app's lifespan, so the repository is injected through its dependency instead.
    Use with: schema = schemathesis.pytest.from_fixture("contract_schema").
    """
    data_file = tmp_path_factory.mktemp("contract") / "q.json"
    app = create_app(Settings(transcriber="fake", data_file=data_file))
    repository = JsonFileQuestionRepository(data_file)
    app.dependency_overrides[get_question_repository] = lambda: repository
    schema = schemathesis.openapi.from_path(OPENAPI)
    schema.app = app
    # The Host guard only accepts localhost, so don't use the contract's 127.0.0.1:8000 server.
    schema.config.update(base_url="http://localhost")
    return schema

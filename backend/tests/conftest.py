import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


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
def client():
    return TestClient(create_app(Settings(transcriber="fake")))

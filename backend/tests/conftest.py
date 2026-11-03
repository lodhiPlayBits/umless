import os

# Tests never report to Sentry. Settings.from_env reads backend/.env, and importing app.main (just
# below) builds the app from it, so a SENTRY_DSN there would send every error the tests provoke
# (fake 500s, fake secrets) to the real project and email the owner. The real environment wins
# over .env, and an empty value means no DSN. Must stay above the app imports.
os.environ["SENTRY_DSN"] = ""

from pathlib import Path

import pytest
import schemathesis
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import make_url, text

from app.config import Settings
from app.main import create_app
from app.questions.repository import JsonFileQuestionRepository
from app.questions.router import get_question_repository
from app.billing.router import get_billing
from app.billing.store import InMemoryBillingStore, Order
from app.db import create_mysql_engine
from app.questions.sql import SqlQuestionStore
from app.takes.objects import InMemoryObjects
from app.takes.repository import InMemoryTakeStore
from tests.auth_tokens import make_token, require_sign_in

BACKEND_DIR = Path(__file__).resolve().parents[1]
OPENAPI = BACKEND_DIR.parent / "docs" / "api" / "openapi.yaml"
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


def alembic_config(url) -> Config:
    config = Config(BACKEND_DIR / "alembic.ini")
    config.attributes["url"] = url
    return config


@pytest.fixture(scope="session")
def mysql_engine():
    """An empty MySQL database migrated to head, from UMLESS_TEST_DATABASE_URL.

    Skips without it. Every table in that database is dropped first, so never point it at
    real data: mysql+pymysql://user:password@127.0.0.1:3307/umless_test?charset=utf8mb4
    """
    raw_url = os.environ.get("UMLESS_TEST_DATABASE_URL")
    if not raw_url:
        pytest.skip("UMLESS_TEST_DATABASE_URL is not set")
    url = make_url(raw_url)
    engine = create_mysql_engine(url)
    with engine.begin() as conn:
        for table in conn.execute(text("SHOW TABLES")).scalars():
            conn.execute(text(f"DROP TABLE `{table}`"))
    command.upgrade(alembic_config(url), "head")
    yield engine
    engine.dispose()


@pytest.fixture(scope="session")
def mysql_store(mysql_engine):
    return SqlQuestionStore(mysql_engine)


@pytest.fixture
def client(tmp_path):
    app = create_app(Settings(transcriber="fake", data_file=tmp_path / "q.json"))
    with TestClient(app, base_url="http://localhost") as c:
        yield c


@pytest.fixture(scope="session")
def contract_schema(tmp_path_factory):
    """docs/api/openapi.yaml bound to the app in-process, for Schemathesis contract tests.

    Fake transcriber (no Deepgram calls), sign-in required with a test token, and a throwaway
    questions file. Schemathesis doesn't run the app's lifespan, so the repository is injected
    through its dependency and the take stores are set on app.state instead.
    Use with: schema = schemathesis.pytest.from_fixture("contract_schema").
    """
    data_file = tmp_path_factory.mktemp("contract") / "q.json"
    # A high hourly cap, so fuzzed transcriptions never hit 429 (it has its own tests).
    settings = Settings(transcriber="fake", data_file=data_file, transcriptions_per_hour=10**9, contact_to="owner@example.com")
    app = require_sign_in(create_app(settings))
    repository = JsonFileQuestionRepository(data_file)
    app.dependency_overrides[get_question_repository] = lambda: repository
    app.state.questions = repository  # createTranscription saving a take reads it directly
    app.state.takes = InMemoryTakeStore()
    app.state.transcripts = InMemoryObjects()
    # Metered, so the payment operations and 402 are exercised; orders never reach Razorpay.
    from tests.test_billing import FakeRazorpay

    app.state.razorpay = FakeRazorpay()
    # A fake mailer, so fuzzed contact messages are "sent" (5xx counts as a contract failure).
    from tests.test_contact import FakeMailer

    app.state.mailer = FakeMailer()
    # A high cap, so fuzzed crash reports never hit 429 (tests/test_client_errors.py covers it).
    from app.limits import InMemoryLimits

    app.state.client_error_limits = InMemoryLimits(10**9)
    # Fuzzed bytes aren't audio: a fixed length, like the fake transcriber (measuring has its own tests).
    app.state.measure_audio = lambda audio: 30.0
    # Plenty of paid time, so fuzzed transcriptions never run out (402 has its own tests).
    billing = InMemoryBillingStore()
    billing.add_order(Order("order_contract", "user_alice", "session_5", 12000, 10**9, "created"))
    billing.mark_paid("order_contract", "pay_contract")
    app.dependency_overrides[get_billing] = lambda: billing
    schema = schemathesis.openapi.from_path(OPENAPI)
    schema.app = app
    # The Host guard only accepts localhost, so don't use the contract's 127.0.0.1:8000 server.
    # Sign-in is on, so Schemathesis also checks that calls without the token get 401.
    schema.config.update(
        base_url="http://localhost",
        headers={"Authorization": f"Bearer {make_token(lifetime=24 * 3600)}"},
    )
    return schema


@pytest.fixture(autouse=True)
def _sentry_stays_off():
    """Fail loudly if anything pointed Sentry at a real project in a test: its alerts would reach the real inbox.

    tests/test_monitoring.py turns it on with a capturing transport, inside its own fixture.
    """
    import sentry_sdk

    # A DSN is what lets events leave; a client re-initialised without one (test_monitoring does) is harmless.
    assert not sentry_sdk.get_client().dsn, "Sentry has a DSN during a test: check SENTRY_DSN handling in tests/conftest.py"
    yield

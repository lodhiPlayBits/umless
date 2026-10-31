"""Queue logging (app/log.py) and the events the backend logs."""

import io
import logging
import re

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.log import start_logging
from app.transcription import DeepgramAccountError, TranscriptionError
from tests.test_limits import AUDIO, GatedTranscriber, make_app

LINE = re.compile(r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ (INFO|WARNING) [\w.]+ .+$")


def test_records_go_through_the_queue_and_stop_flushes_them():
    out = io.StringIO()
    stop = start_logging("INFO", stream=out)
    logging.getLogger("app.example").info("Hello %s", "there")
    logging.getLogger("app.example").debug("Below the level")
    stop()

    lines = out.getvalue().splitlines()
    assert len(lines) == 1
    assert LINE.match(lines[0]) and lines[0].endswith("INFO app.example Hello there")


def test_the_handler_on_the_request_path_only_queues():
    stop = start_logging("INFO", stream=io.StringIO())
    try:
        assert [type(h) for h in logging.getLogger().handlers] == [logging.handlers.QueueHandler]
    finally:
        stop()


def test_stop_puts_the_previous_handlers_back():
    root = logging.getLogger()
    access = logging.getLogger("uvicorn.access")
    before = (root.handlers[:], root.level, access.handlers[:], access.propagate)

    start_logging("DEBUG", stream=io.StringIO())()

    assert (root.handlers, root.level, access.handlers, access.propagate) == before


def test_uvicorn_logs_go_through_the_queue_too():
    access = logging.getLogger("uvicorn.access")
    own = logging.StreamHandler(io.StringIO())
    access.addHandler(own)
    access.propagate = False
    out = io.StringIO()
    stop = start_logging("INFO", stream=out)
    access.info('%s - "%s %s HTTP/%s" %d', "127.0.0.1:5000", "GET", "/api/health", "1.1", 200)
    stop()
    access.removeHandler(own)
    access.propagate = True

    assert 'INFO uvicorn.access 127.0.0.1:5000 - "GET /api/health HTTP/1.1" 200' in out.getvalue()


# --- settings ----------------------------------------------------------------------------


def test_servers_log_at_info_by_default_and_tests_leave_logging_alone(monkeypatch):
    monkeypatch.delenv("UMLESS_LOG_LEVEL", raising=False)

    assert Settings.from_env(env_files=()).log_level == "INFO"
    assert Settings().log_level is None


def test_the_log_level_is_read_case_insensitively(monkeypatch):
    monkeypatch.setenv("UMLESS_LOG_LEVEL", "debug")

    assert Settings.from_env(env_files=()).log_level == "DEBUG"


def test_a_bad_log_level_is_refused(monkeypatch):
    monkeypatch.setenv("UMLESS_LOG_LEVEL", "loud")

    with pytest.raises(ValueError, match="UMLESS_LOG_LEVEL"):
        Settings.from_env(env_files=())


def test_the_lifespan_starts_and_stops_logging(capsys, tmp_path):
    root_handlers = logging.getLogger().handlers[:]
    app = make_app(GatedTranscriber(), data_file=tmp_path / "q.json", log_level="INFO")

    with TestClient(app, base_url="http://localhost"):
        pass

    out = capsys.readouterr().out
    assert "INFO app.main Transcription limits in memory, 30 per user per hour" in out
    assert "INFO app.main Shutting down" in out
    assert logging.getLogger().handlers == root_handlers


# --- events ------------------------------------------------------------------------------


def post(client):
    return client.post("/api/transcriptions", content=AUDIO, headers={"Content-Type": "audio/webm"})


def test_a_transcription_is_logged_without_its_text(caplog, tmp_path):
    transcriber = GatedTranscriber()
    transcriber.release.set()
    caplog.set_level(logging.INFO, logger="app")
    with TestClient(make_app(transcriber, data_file=tmp_path / "q.json"), base_url="http://localhost") as client:
        assert post(client).status_code == 200

    messages = [r.getMessage() for r in caplog.records if r.name == "app.transcription.router"]
    assert messages == ["Transcribed 0.5 s of audio for local: 1 words, not charged, take not saved"]
    assert "Hi" not in caplog.text


def test_an_hourly_cap_refusal_is_logged(caplog, tmp_path):
    transcriber = GatedTranscriber()
    transcriber.release.set()
    caplog.set_level(logging.INFO, logger="app")
    app = make_app(transcriber, data_file=tmp_path / "q.json", transcriptions_per_hour=1)
    with TestClient(app, base_url="http://localhost") as client:
        post(client)
        assert post(client).status_code == 429

    assert "Refused a transcription for local: over the hourly cap" in caplog.text


class RefusedTranscriber:
    def __init__(self, error):
        self.error = error

    async def transcribe(self, audio, content_type):
        raise self.error


@pytest.mark.parametrize(
    "error, level",
    [
        (DeepgramAccountError("Deepgram refused the account (HTTP 401): check the key and the balance"), "ERROR"),
        (TranscriptionError("Deepgram returned HTTP 503"), "WARNING"),
    ],
)
def test_a_refused_deepgram_account_is_logged_as_an_error(caplog, tmp_path, error, level):
    # A revoked key or empty balance breaks every transcription: ERROR alerts, WARNING doesn't.
    caplog.set_level(logging.INFO, logger="app")
    with TestClient(make_app(RefusedTranscriber(error), data_file=tmp_path / "q.json"), base_url="http://localhost") as client:
        assert post(client).status_code == 502

    [record] = [r for r in caplog.records if r.getMessage().startswith("Transcription failed")]
    assert record.levelname == level

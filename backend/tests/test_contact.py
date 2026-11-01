"""POST /api/contact: complaints and suggestions emailed to the umless inbox."""

import json

import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.contact.mailer import MailError, ResendMailer
from app.main import create_app
from tests.auth_tokens import make_token, require_sign_in

API_KEY = "re_secret_key_123"
GOOD = {"kind": "suggestion", "name": "Asha", "email": "asha@example.com", "message": "Could the summary show my pace by week?"}


class FakeMailer:
    def __init__(self, fail=False):
        self.fail = fail
        self.sent = []

    async def send(self, to, reply_to, subject, text):
        if self.fail:
            raise MailError("send email: HTTP 403 The onboarding@resend.dev sender can only send to the account owner")
        self.sent.append({"to": to, "reply_to": reply_to, "subject": subject, "text": text})
        return "email_1"


def make_client(mailer=None, contact_to="owner@example.com"):
    app = create_app(Settings(transcriber="fake", contact_to=contact_to))
    app.state.mailer = mailer
    return TestClient(app, base_url="http://localhost")


def send(client, body=GOOD, **kwargs):
    return client.post("/api/contact", json=body, **kwargs)


def test_a_message_is_emailed_with_the_sender_as_reply_to(contract_schema):
    mailer = FakeMailer()
    response = send(make_client(mailer))

    assert response.status_code == 204
    contract_schema.find_operation_by_id("sendContactMessage").validate_response(response)
    [mail] = mailer.sent
    assert (mail["to"], mail["reply_to"]) == ("owner@example.com", "asha@example.com")
    assert mail["subject"] == "[umless] Suggestion from Asha"
    assert "From: Asha <asha@example.com>" in mail["text"]
    assert "Account: local" in mail["text"]
    assert "Could the summary show my pace by week?" in mail["text"]


@pytest.mark.parametrize("kind, label", [("complaint", "Complaint"), ("other", "Message")])
def test_the_subject_says_what_kind_it_is(kind, label):
    mailer = FakeMailer()
    send(make_client(mailer), {**GOOD, "kind": kind})
    assert mailer.sent[0]["subject"] == f"[umless] {label} from Asha"


@pytest.mark.parametrize(
    "change",
    [
        {"name": "   "},
        {"name": "Asha\nBcc: everyone@example.com"},  # header injection through the subject
        {"name": "x" * 101},
        {"email": "not-an-email"},
        {"email": "a b@example.com"},
        {"message": "too short"},
        {"message": "x" * 5001},
        {"kind": "praise"},
        {"extra": "field"},
    ],
)
def test_invalid_messages_are_422_and_not_sent(change):
    mailer = FakeMailer()
    response = send(make_client(mailer), {**GOOD, **change})

    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"
    assert mailer.sent == []


def test_only_json_is_accepted():
    mailer = FakeMailer()
    response = make_client(mailer).post("/api/contact", content=json.dumps(GOOD), headers={"Content-Type": "text/plain"})
    assert response.status_code == 415
    assert mailer.sent == []


def test_sign_in_is_required():
    mailer = FakeMailer()
    app = require_sign_in(create_app(Settings(transcriber="fake", contact_to="owner@example.com")))
    app.state.mailer = mailer
    with TestClient(app, base_url="http://localhost") as client:
        assert send(client).status_code == 401
        assert send(client, headers={"Authorization": f"Bearer {make_token()}"}).status_code == 204
    assert len(mailer.sent) == 1


def test_at_most_five_messages_an_hour():
    mailer = FakeMailer()
    client = make_client(mailer)
    codes = [send(client).status_code for _ in range(6)]

    assert codes == [204] * 5 + [429]
    assert send(client).json()["code"] == "rate_limited"
    assert len(mailer.sent) == 5


def test_without_an_email_provider_its_503():
    for client in (make_client(None), make_client(FakeMailer(), contact_to=None)):
        response = send(client)
        assert response.status_code == 503
        assert response.json()["code"] == "contact_unavailable"


def test_a_provider_failure_is_502_and_logged_as_an_error(caplog):
    response = send(make_client(FakeMailer(fail=True)))

    assert response.status_code == 502
    assert response.json() == {"code": "contact_failed", "detail": "Your message couldn't be sent. Try again in a moment, or email us."}
    [record] = [r for r in caplog.records if "couldn't be sent" in r.getMessage()]
    assert record.levelname == "ERROR"
    assert "Could the summary" not in caplog.text  # the message itself is never logged


# --- Resend client -----------------------------------------------------------------------


@pytest.mark.anyio
async def test_resend_is_called_with_the_key_and_a_plain_text_email():
    seen = []

    def handler(request):
        seen.append(request)
        return httpx.Response(200, json={"id": "email_123"})

    mailer = ResendMailer(API_KEY, "umless <onboarding@resend.dev>", transport=httpx.MockTransport(handler))
    assert await mailer.send("owner@example.com", "asha@example.com", "Hi", "Body") == "email_123"

    [request] = seen
    assert str(request.url) == "https://api.resend.com/emails"
    assert request.headers["Authorization"] == f"Bearer {API_KEY}"
    assert json.loads(request.content) == {
        "from": "umless <onboarding@resend.dev>",
        "to": ["owner@example.com"],
        "reply_to": "asha@example.com",
        "subject": "Hi",
        "text": "Body",
    }


@pytest.mark.anyio
@pytest.mark.parametrize("failure", [httpx.Response(403, json={"message": "Domain not verified"}), httpx.ConnectError("down")])
async def test_resend_failures_raise_without_the_key(failure):
    def handler(request):
        if isinstance(failure, Exception):
            raise failure
        return failure

    mailer = ResendMailer(API_KEY, "umless <onboarding@resend.dev>", transport=httpx.MockTransport(handler))
    with pytest.raises(MailError) as error:
        await mailer.send("owner@example.com", "asha@example.com", "Hi", "Body")
    assert API_KEY not in str(error.value)


def test_settings_read_the_contact_settings_without_showing_the_key(monkeypatch):
    monkeypatch.setenv("RESEND_API_KEY", API_KEY)
    monkeypatch.setenv("CONTACT_TO", "owner@example.com")
    monkeypatch.delenv("CONTACT_FROM", raising=False)

    s = Settings.from_env(env_files=())

    assert (s.resend_api_key, s.contact_to, s.contact_from) == (API_KEY, "owner@example.com", "umless <onboarding@resend.dev>")
    assert API_KEY not in repr(s)

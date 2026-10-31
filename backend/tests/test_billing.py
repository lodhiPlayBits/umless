"""Practice time: 3 free transcriptions, then paid minutes bought through Razorpay."""

import hashlib
import hmac
import json

import httpx
import pytest
from fastapi.testclient import TestClient

from app.billing.packs import PACKS
from app.billing.razorpay import Razorpay, RazorpayError
from app.billing.sql import SqlBillingStore
from app.billing.store import Balance, InMemoryBillingStore, Order, charged_seconds
from app.config import Settings
from app.main import create_app
from app.transcription.models import Transcript
from app.transcription.router import get_transcriber
from tests.auth_tokens import make_token, require_sign_in

AUDIO = b"\x00\x01fake-audio-bytes\xff"
KEY_SECRET = "test-key-secret"
WEBHOOK_SECRET = "test-webhook-secret"
FAKE_SECONDS = 4  # the fake transcript lasts 3.5 s, charged rounded up


class FakeRazorpay(Razorpay):
    """Real signature checks, but orders are made up instead of created at Razorpay."""

    def __init__(self, fail=False, captured=True, refund_fails=False):
        super().__init__("rzp_test_key", KEY_SECRET, WEBHOOK_SECRET)
        self.fail = fail
        self.captured = captured  # True, False, or an exception to raise
        self.refund_fails = refund_fails
        self.orders = []
        self.refunds = []

    def refund(self, payment_id, amount_paise, notes):
        if self.refund_fails:
            raise RazorpayError("refund payment: HTTP 400 The balance is insufficient")
        self.refunds.append((payment_id, amount_paise, notes))
        return f"rfnd_{len(self.refunds):06d}"

    def payment_is_captured(self, payment_id, order_id, amount_paise, currency):
        if isinstance(self.captured, Exception):
            raise self.captured
        return self.captured

    def create_order(self, amount_paise, currency, receipt, notes):
        if self.fail:
            raise RazorpayError("create order: HTTP 401 Authentication failed")
        order_id = f"order_{len(self.orders) + 1:06d}"
        self.orders.append({"id": order_id, "amount": amount_paise, "currency": currency, "notes": notes})
        return order_id


class SilentTranscriber:
    async def transcribe(self, audio, content_type):
        return Transcript(words=[], duration_seconds=30.0)


class NeverCalledTranscriber:
    async def transcribe(self, audio, content_type):
        raise AssertionError("Deepgram must not be called without practice time")


def metered_app(tmp_path, razorpay=None):
    settings = Settings(
        transcriber="fake",
        data_file=tmp_path / "q.json",
        razorpay_key_id="rzp_test_key",
        razorpay_key_secret=KEY_SECRET,
        razorpay_webhook_secret=WEBHOOK_SECRET,
    )
    app = create_app(settings)
    app.state.razorpay = razorpay or FakeRazorpay()
    return app


@pytest.fixture
def client(tmp_path):
    with TestClient(metered_app(tmp_path), base_url="http://localhost") as c:
        yield c


def transcribe(client, headers=None):
    return client.post(
        "/api/transcriptions", content=AUDIO, headers={"Content-Type": "audio/webm", **(headers or {})}
    )


def account(client, headers=None):
    return client.get("/api/account", headers=headers).json()


def pay(client, pack_id="session_1", headers=None):
    """Buy a pack the way Checkout does: order, then verify with Razorpay's signature."""
    order = client.post("/api/payments/orders", json={"pack_id": pack_id}, headers=headers).json()
    payment_id = f"pay_{order['order_id']}"
    signature = hmac.new(KEY_SECRET.encode(), f"{order['order_id']}|{payment_id}".encode(), hashlib.sha256).hexdigest()
    body = {"order_id": order["order_id"], "payment_id": payment_id, "signature": signature}
    return order, client.post("/api/payments/verify", json=body, headers=headers)


def use_up_free(client):
    for _ in range(3):
        assert transcribe(client).status_code == 200


def validate(contract_schema, operation_id, response):
    contract_schema.find_operation_by_id(operation_id).validate_response(response)


def webhook(client, event, secret=WEBHOOK_SECRET):
    raw = json.dumps(event).encode()
    signature = hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
    return client.post(
        "/api/payments/webhook",
        content=raw,
        headers={"Content-Type": "application/json", "X-Razorpay-Signature": signature},
    )


def captured(order_id, amount, payment_id="pay_webhook1"):
    return {
        "event": "payment.captured",
        "payload": {"payment": {"entity": {"id": payment_id, "order_id": order_id, "amount": amount}}},
    }


# --- free transcriptions and paid time ---------------------------------------------------


def test_a_new_account_has_three_free_transcriptions_and_the_packs(client, contract_schema):
    response = client.get("/api/account")

    assert response.status_code == 200
    validate(contract_schema, "getAccount", response)
    body = response.json()
    assert (body["metered"], body["free_transcriptions_left"], body["seconds_left"]) == (True, 3, 0)
    assert [(p["id"], p["seconds"], p["amount_paise"]) for p in body["packs"]] == [
        ("session_1", 3600, 4000),
        ("session_5", 18000, 12000),
    ]


def test_without_razorpay_nothing_is_metered(tmp_path, contract_schema):
    with TestClient(create_app(Settings(transcriber="fake", data_file=tmp_path / "q.json")), base_url="http://localhost") as c:
        response = c.get("/api/account")
        for _ in range(5):
            assert transcribe(c).status_code == 200

    validate(contract_schema, "getAccount", response)
    assert response.json() == {"metered": False, "free_transcriptions_left": 0, "seconds_left": 0, "packs": []}


def test_free_transcriptions_run_out_then_402_before_deepgram(tmp_path, contract_schema):
    app = metered_app(tmp_path)
    with TestClient(app, base_url="http://localhost") as c:
        use_up_free(c)
        assert account(c)["free_transcriptions_left"] == 0
        app.dependency_overrides[get_transcriber] = lambda: NeverCalledTranscriber()
        response = transcribe(c)

    assert response.status_code == 402
    assert response.json()["code"] == "payment_required"
    validate(contract_schema, "createTranscription", response)


def test_a_take_without_words_is_free(tmp_path):
    app = metered_app(tmp_path)
    app.dependency_overrides[get_transcriber] = lambda: SilentTranscriber()
    with TestClient(app, base_url="http://localhost") as c:
        assert transcribe(c).status_code == 200
        assert account(c)["free_transcriptions_left"] == 3


def test_paid_time_is_used_after_the_free_transcriptions(client):
    use_up_free(client)
    pay(client)

    assert transcribe(client).status_code == 200
    assert account(client)["seconds_left"] == 3600 - FAKE_SECONDS


def test_the_last_seconds_still_allow_one_more_take_then_stop_at_zero():
    store = InMemoryBillingStore()
    for _ in range(3):
        store.charge("u", 10)
    store.add_order(Order("o1", "u", "session_1", 4000, 2, "created"))
    store.mark_paid("o1", "p1")

    assert store.charge("u", 90) == Balance(0, 0)
    assert store.balance("u").can_transcribe is False


@pytest.mark.parametrize("duration, expected", [(0, 0), (3.0, 3), (3.01, 4), (59.9999999999, 60)])
def test_charged_seconds_round_up(duration, expected):
    assert charged_seconds(duration) == expected


# --- buying time -------------------------------------------------------------------------


def test_creating_an_order_uses_the_server_price(client, contract_schema):
    response = client.post("/api/payments/orders", json={"pack_id": "session_5"})

    assert response.status_code == 201
    validate(contract_schema, "createPaymentOrder", response)
    body = response.json()
    assert (body["amount_paise"], body["currency"], body["key_id"]) == (12000, "INR", "rzp_test_key")
    [sent] = client.app.state.razorpay.orders
    assert sent["amount"] == 12000
    assert sent["notes"]["pack_id"] == "session_5"


@pytest.mark.parametrize("body", [{"pack_id": "free_forever"}, {"pack_id": "session_1", "amount_paise": 1}, {}])
def test_only_known_packs_can_be_ordered(client, contract_schema, body):
    response = client.post("/api/payments/orders", json=body)

    assert response.status_code == 422
    validate(contract_schema, "createPaymentOrder", response)


def test_a_razorpay_failure_is_502(tmp_path, contract_schema):
    with TestClient(metered_app(tmp_path, FakeRazorpay(fail=True)), base_url="http://localhost") as c:
        response = c.post("/api/payments/orders", json={"pack_id": "session_1"})

    assert response.status_code == 502
    assert response.json()["code"] == "payment_provider_failed"
    assert KEY_SECRET not in response.text
    validate(contract_schema, "createPaymentOrder", response)


def test_without_razorpay_orders_are_503(tmp_path, contract_schema):
    with TestClient(create_app(Settings(transcriber="fake", data_file=tmp_path / "q.json")), base_url="http://localhost") as c:
        response = c.post("/api/payments/orders", json={"pack_id": "session_1"})

    assert response.status_code == 503
    validate(contract_schema, "createPaymentOrder", response)


def test_a_verified_payment_adds_the_pack_time_once(client, contract_schema):
    order, response = pay(client, "session_5")

    assert response.status_code == 200
    validate(contract_schema, "verifyPayment", response)
    assert response.json()["seconds_left"] == 18000
    # The same success handler again (a retry, a double click) adds nothing.
    payment_id = f"pay_{order['order_id']}"
    again = client.post(
        "/api/payments/verify",
        json={
            "order_id": order["order_id"],
            "payment_id": payment_id,
            "signature": hmac.new(KEY_SECRET.encode(), f"{order['order_id']}|{payment_id}".encode(), hashlib.sha256).hexdigest(),
        },
    )
    assert again.json()["seconds_left"] == 18000


def test_a_forged_signature_adds_nothing(client, contract_schema):
    order = client.post("/api/payments/orders", json={"pack_id": "session_1"}).json()
    response = client.post(
        "/api/payments/verify",
        json={"order_id": order["order_id"], "payment_id": "pay_x", "signature": "0" * 64},
    )

    assert response.status_code == 400
    assert response.json()["code"] == "payment_invalid"
    validate(contract_schema, "verifyPayment", response)
    assert account(client)["seconds_left"] == 0


def test_a_payment_razorpay_has_not_captured_adds_nothing(tmp_path, contract_schema):
    with TestClient(metered_app(tmp_path, FakeRazorpay(captured=False)), base_url="http://localhost") as c:
        _, response = pay(c)

        assert response.status_code == 400
        assert response.json()["code"] == "payment_invalid"
        validate(contract_schema, "verifyPayment", response)
        assert account(c)["seconds_left"] == 0


def test_when_razorpay_cant_confirm_the_payment_it_is_502_and_can_be_retried(tmp_path, contract_schema):
    razorpay = FakeRazorpay(captured=RazorpayError("fetch payment: ConnectTimeout"))
    with TestClient(metered_app(tmp_path, razorpay), base_url="http://localhost") as c:
        order, response = pay(c)

        assert response.status_code == 502
        assert response.json()["code"] == "payment_provider_failed"
        validate(contract_schema, "verifyPayment", response)
        assert c.app.state.billing.get_order(order["order_id"]).status == "created"


def test_an_unknown_order_is_404(client, contract_schema):
    response = client.post(
        "/api/payments/verify", json={"order_id": "order_nope", "payment_id": "pay_x", "signature": "x"}
    )

    assert response.status_code == 404
    assert response.json()["code"] == "order_not_found"
    validate(contract_schema, "verifyPayment", response)


def test_payments_need_sign_in_and_orders_are_private(tmp_path):
    alice = {"Authorization": f"Bearer {make_token('user_alice')}"}
    bob = {"Authorization": f"Bearer {make_token('user_bob')}"}
    with TestClient(require_sign_in(metered_app(tmp_path)), base_url="http://localhost") as c:
        assert c.get("/api/account").status_code == 401
        assert c.post("/api/payments/orders", json={"pack_id": "session_1"}).status_code == 401
        order = c.post("/api/payments/orders", json={"pack_id": "session_1"}, headers=alice).json()
        payment_id = "pay_1"
        signature = hmac.new(KEY_SECRET.encode(), f"{order['order_id']}|{payment_id}".encode(), hashlib.sha256).hexdigest()
        body = {"order_id": order["order_id"], "payment_id": payment_id, "signature": signature}

        # Bob can't claim Alice's paid order, even with its genuine signature.
        assert c.post("/api/payments/verify", json=body, headers=bob).status_code == 404
        assert c.post("/api/payments/verify", json=body, headers=alice).json()["seconds_left"] == 3600
        assert account(c, bob)["seconds_left"] == 0


# --- purchases ---------------------------------------------------------------------------


def test_a_paid_order_is_listed_as_a_purchase_with_its_receipt_id(client, contract_schema):
    assert client.get("/api/payments").json() == {"items": []}
    order, _ = pay(client, "session_1")
    client.post("/api/payments/orders", json={"pack_id": "session_5"})  # opened, never paid

    response = client.get("/api/payments")
    assert response.status_code == 200
    validate(contract_schema, "listPurchases", response)
    [purchase] = response.json()["items"]
    assert purchase["order_id"] == order["order_id"]
    assert purchase["payment_id"] == f"pay_{order['order_id']}"
    assert purchase["label"] == "1 session · 60 minutes"
    assert (purchase["seconds"], purchase["amount_paise"], purchase["currency"]) == (3600, 4000, "INR")
    assert purchase["paid_at"].endswith("Z")


def test_purchases_are_newest_first_and_include_webhook_credits(client):
    first, _ = pay(client, "session_1")
    second = client.post("/api/payments/orders", json={"pack_id": "session_5"}).json()
    webhook(client, captured(second["order_id"], 12000, payment_id="pay_hook"))

    items = client.get("/api/payments").json()["items"]
    assert [p["order_id"] for p in items] == [second["order_id"], first["order_id"]]
    assert items[0]["payment_id"] == "pay_hook"


def test_purchases_need_sign_in_and_are_private(tmp_path):
    alice = {"Authorization": f"Bearer {make_token('user_alice')}"}
    bob = {"Authorization": f"Bearer {make_token('user_bob')}"}
    with TestClient(require_sign_in(metered_app(tmp_path)), base_url="http://localhost") as c:
        pay(c, headers=alice)
        assert c.get("/api/payments").status_code == 401
        assert len(c.get("/api/payments", headers=alice).json()["items"]) == 1
        assert c.get("/api/payments", headers=bob).json() == {"items": []}


def test_without_razorpay_there_are_no_purchases(tmp_path, contract_schema):
    settings = Settings(transcriber="fake", data_file=tmp_path / "q.json")
    with TestClient(create_app(settings), base_url="http://localhost") as c:
        response = c.get("/api/payments")
    assert response.json() == {"items": []}
    validate(contract_schema, "listPurchases", response)


# --- webhook -----------------------------------------------------------------------------


def test_the_webhook_credits_an_order_the_browser_never_verified(client, contract_schema):
    order = client.post("/api/payments/orders", json={"pack_id": "session_1"}).json()

    response = webhook(client, captured(order["order_id"], 4000))

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    validate(contract_schema, "razorpayWebhook", response)
    assert account(client)["seconds_left"] == 3600


def test_webhook_and_verify_together_credit_once(client):
    order, _ = pay(client)
    webhook(client, captured(order["order_id"], 4000))
    webhook(client, {**captured(order["order_id"], 4000), "event": "order.paid"})

    assert account(client)["seconds_left"] == 3600


def test_the_webhook_needs_razorpays_signature_not_a_sign_in(tmp_path, contract_schema):
    with TestClient(require_sign_in(metered_app(tmp_path)), base_url="http://localhost") as c:
        alice = {"Authorization": f"Bearer {make_token('user_alice')}"}
        order = c.post("/api/payments/orders", json={"pack_id": "session_1"}, headers=alice).json()

        forged = webhook(c, captured(order["order_id"], 4000), secret="guessed")
        assert forged.status_code == 400
        validate(contract_schema, "razorpayWebhook", forged)
        assert account(c, alice)["seconds_left"] == 0

        assert webhook(c, captured(order["order_id"], 4000)).status_code == 200
        assert account(c, alice)["seconds_left"] == 3600


@pytest.mark.parametrize(
    "event",
    [
        pytest.param(captured("order_unknown", 4000), id="unknown-order"),
        pytest.param({"event": "payment.failed", "payload": {"payment": {"entity": {"id": "p", "order_id": "order_000001", "amount": 4000}}}}, id="failed"),
        pytest.param({"event": "refund.created", "payload": {}}, id="other-event"),
        pytest.param(captured("order_000001", 1), id="amount-mismatch"),
    ],
)
def test_other_webhook_events_are_acknowledged_and_ignored(client, event):
    client.post("/api/payments/orders", json={"pack_id": "session_1"})

    response = webhook(client, event)

    assert response.json() == {"status": "ignored"}
    assert account(client)["seconds_left"] == 0


def test_without_a_webhook_secret_the_webhook_is_503(tmp_path, contract_schema):
    app = metered_app(tmp_path, Razorpay("rzp_test_key", KEY_SECRET, webhook_secret=None))
    with TestClient(app, base_url="http://localhost") as c:
        response = webhook(c, captured("order_1", 4000))

    assert response.status_code == 503
    validate(contract_schema, "razorpayWebhook", response)


# --- Razorpay client ---------------------------------------------------------------------


def test_create_order_calls_razorpay_with_basic_auth(monkeypatch):
    calls = []

    def fake_post(url, auth, json, timeout):
        calls.append((url, auth, json))
        return httpx.Response(200, json={"id": "order_abc", "status": "created"})

    monkeypatch.setattr(httpx, "post", fake_post)
    order_id = Razorpay("rzp_test_key", KEY_SECRET).create_order(4000, "INR", "r" * 60, {"pack_id": "session_1"})

    assert order_id == "order_abc"
    [(url, auth, body)] = calls
    assert url == "https://api.razorpay.com/v1/orders"
    assert auth == ("rzp_test_key", KEY_SECRET)
    assert body["amount"] == 4000 and len(body["receipt"]) == 40


@pytest.mark.parametrize(
    "response", [httpx.Response(401, json={"error": {"description": "Authentication failed"}}), httpx.ConnectError("down")]
)
def test_create_order_failures_raise_without_the_secret(monkeypatch, response):
    def fake_post(*args, **kwargs):
        if isinstance(response, Exception):
            raise response
        return response

    monkeypatch.setattr(httpx, "post", fake_post)
    with pytest.raises(RazorpayError) as error:
        Razorpay("rzp_test_key", KEY_SECRET).create_order(4000, "INR", "r", {})
    assert KEY_SECRET not in str(error.value)


def test_payment_signature_matches_razorpays_documented_scheme():
    razorpay = Razorpay("rzp_test_key", KEY_SECRET)
    good = hmac.new(KEY_SECRET.encode(), b"order_1|pay_1", hashlib.sha256).hexdigest()

    assert razorpay.payment_is_genuine("order_1", "pay_1", good)
    assert not razorpay.payment_is_genuine("order_1", "pay_2", good)
    assert not razorpay.payment_is_genuine("order_1", "pay_1", "")


# --- MySQL store -------------------------------------------------------------------------


def test_sql_billing_store(mysql_engine, tmp_path):
    store = SqlBillingStore(mysql_engine)
    user = f"{tmp_path}/user"

    assert store.balance(user) == Balance(3, 0)
    for left in (2, 1, 0):
        assert store.charge(user, 50) == Balance(left, 0)
    assert store.charge(user, 50) == Balance(0, 0)

    order = Order(f"order_{tmp_path.name}"[:64], user, "session_1", 4000, 3600, "created")
    store.add_order(order)
    assert store.get_order(order.id) == order
    assert store.mark_paid(order.id, "pay_1") == Balance(0, 3600)
    assert store.mark_paid(order.id, "pay_1") == Balance(0, 3600)
    assert store.get_order(order.id).status == "paid"
    assert store.charge(user, 59.2) == Balance(0, 3540)
    assert store.mark_paid("order_missing", "pay_1") is None

    # Purchases: paid orders only, with their payment id and when they were paid.
    open_order = Order(f"open_{tmp_path.name}"[:64], user, "session_5", 12000, 18000, "created")
    store.add_order(open_order)
    [purchase] = store.purchases(user)
    assert (purchase.id, purchase.payment_id, purchase.status) == (order.id, "pay_1", "paid")
    assert purchase.paid_at and purchase.paid_at.endswith("Z")
    assert store.purchases(f"{tmp_path}/someone-else") == []


# --- settings ----------------------------------------------------------------------------


def test_settings_read_razorpay(monkeypatch):
    monkeypatch.setenv("RAZORPAY_KEY_ID", "rzp_test_abc")
    monkeypatch.setenv("RAZORPAY_KEY_SECRET", "secret")
    monkeypatch.setenv("RAZORPAY_WEBHOOK_SECRET", "whsec")

    s = Settings.from_env(env_files=())

    assert (s.razorpay_key_id, s.razorpay_key_secret, s.razorpay_webhook_secret) == ("rzp_test_abc", "secret", "whsec")
    assert "secret" not in repr(s).replace("razorpay_key_id", "")


def test_half_a_razorpay_key_is_refused(monkeypatch):
    monkeypatch.setenv("RAZORPAY_KEY_ID", "rzp_test_abc")
    monkeypatch.delenv("RAZORPAY_KEY_SECRET", raising=False)

    with pytest.raises(ValueError, match="RAZORPAY_KEY_SECRET"):
        Settings.from_env(env_files=())


def test_a_database_without_razorpay_is_refused(monkeypatch):
    for name, value in {
        "DB_HOST": "db",
        "DB_USER": "u",
        "DB_PASSWORD": "p",
        "DB_NAME": "n",
        "CLERK_PUBLISHABLE_KEY": "pk_test_c3RhYmxlLWZpc2gtNDkzMC5jbGVyay5hY2NvdW50cy5kZXYk",
        "CLERK_AUTHORIZED_PARTIES": "https://umless.in",
        "OCI_BUCKET": "b",
        "OCI_NAMESPACE": "n",
        "OCI_REGION": "r",
    }.items():
        monkeypatch.setenv(name, value)
    monkeypatch.delenv("RAZORPAY_KEY_ID", raising=False)
    monkeypatch.delenv("RAZORPAY_KEY_SECRET", raising=False)

    with pytest.raises(ValueError, match="RAZORPAY_KEY_ID"):
        Settings.from_env(env_files=())


def test_the_packs_are_the_agreed_prices():
    assert {p.id: (p.seconds // 60, p.amount_paise // 100) for p in PACKS.values()} == {
        "session_1": (60, 40),
        "session_5": (300, 120),
    }


# --- confirming a payment with Razorpay --------------------------------------------------


def razorpay_api(monkeypatch, responses):
    """Replies to Razorpay API calls in order; returns the calls made."""
    calls = []

    def fake_request(method, url, auth, timeout, **kwargs):
        calls.append((method, url.removeprefix("https://api.razorpay.com/v1"), kwargs.get("json")))
        reply = responses.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return reply

    monkeypatch.setattr(httpx, "request", fake_request)
    return calls


def payment(status, order_id="order_1", amount=4000):
    return httpx.Response(200, json={"id": "pay_1", "order_id": order_id, "amount": amount, "status": status})


def is_captured(monkeypatch, *responses):
    calls = razorpay_api(monkeypatch, list(responses))
    return Razorpay("rzp_live_key", KEY_SECRET).payment_is_captured("pay_1", "order_1", 4000, "INR"), calls


def test_a_captured_payment_is_confirmed(monkeypatch):
    confirmed, calls = is_captured(monkeypatch, payment("captured"))

    assert confirmed is True
    assert calls == [("GET", "/payments/pay_1", None)]


def test_an_authorized_payment_is_captured_first(monkeypatch):
    confirmed, calls = is_captured(monkeypatch, payment("authorized"), payment("captured"))

    assert confirmed is True
    assert calls[1] == ("POST", "/payments/pay_1/capture", {"amount": 4000, "currency": "INR"})


def test_a_payment_captured_meanwhile_by_auto_capture_is_confirmed(monkeypatch):
    already = httpx.Response(400, json={"error": {"description": "This payment has already been captured"}})
    confirmed, _ = is_captured(monkeypatch, payment("authorized"), already, payment("captured"))

    assert confirmed is True


@pytest.mark.parametrize(
    "reply",
    [
        pytest.param(payment("created"), id="created"),
        pytest.param(payment("failed"), id="failed"),
        pytest.param(payment("refunded"), id="refunded"),
        pytest.param(payment("captured", order_id="order_other"), id="other-order"),
        pytest.param(payment("captured", amount=100), id="other-amount"),
        pytest.param(httpx.Response(400, json={"error": {"description": "The id provided does not exist"}}), id="unknown"),
    ],
)
def test_anything_but_a_captured_payment_for_this_order_is_not_confirmed(monkeypatch, reply):
    confirmed, _ = is_captured(monkeypatch, reply)

    assert confirmed is False


@pytest.mark.parametrize("reply", [httpx.Response(500, text="oops"), httpx.ConnectTimeout("slow")])
def test_razorpay_being_unreachable_raises(monkeypatch, reply):
    with pytest.raises(RazorpayError) as error:
        is_captured(monkeypatch, reply)
    assert KEY_SECRET not in str(error.value)

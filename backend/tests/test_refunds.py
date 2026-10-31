"""Self-serve refunds of unused packs (docs/roadmap/2026-10-31-self-serve-refunds.md)."""

from app.billing.store import Balance, InMemoryBillingStore, Order, RefundRefused


def test_a_late_payment_webhook_never_credits_a_refunded_order_again():
    # Regression: crediting checked `status != "paid"`, so an order already refunded (or with
    # a refund in flight) was credited again by a late order.paid or payment.captured.
    store = InMemoryBillingStore()
    for status in ("refund_pending", "refunded"):
        store.add_order(Order(f"order_{status}", "u", "session_1", 4000, 3600, status, "pay_1", "2026-10-30T08:50:46Z"))

        assert store.mark_paid(f"order_{status}", "pay_1") == Balance(3, 0)
        assert store.get_order(f"order_{status}").status == status


# --- through the API ---------------------------------------------------------------------

import logging
from dataclasses import replace
from datetime import timedelta

import httpx
import pytest
from fastapi.testclient import TestClient

from app.billing.razorpay import Razorpay, RazorpayError
from app.billing.sql import SqlBillingStore
from app.billing.store import PAID_AT_FORMAT, utc_now
from app.config import Settings
from app.main import create_app
from tests.test_billing import KEY_SECRET, FakeRazorpay, account, captured, metered_app, pay, transcribe, use_up_free, validate, webhook


@pytest.fixture
def razorpay():
    return FakeRazorpay()


@pytest.fixture
def client(tmp_path, razorpay):
    with TestClient(metered_app(tmp_path, razorpay), base_url="http://localhost") as c:
        yield c


def refund(client, order_id):
    return client.post(f"/api/payments/{order_id}/refund")


def purchases(client):
    return client.get("/api/payments").json()["items"]


def set_paid_at(client, order_id, when):
    store = client.app.state.billing
    store._orders[order_id] = replace(store._orders[order_id], paid_at=when.strftime(PAID_AT_FORMAT))


def refund_event(kind, payment_id, amount, refund_id="rfnd_hook1"):
    return {"event": kind, "payload": {"refund": {"entity": {"id": refund_id, "payment_id": payment_id, "amount": amount}}}}


def test_an_unused_pack_is_refundable_and_the_refund_takes_the_time_back(client, razorpay, contract_schema):
    order, _ = pay(client)
    [listed] = purchases(client)
    assert (listed["status"], listed["refundable"]) == ("paid", True)

    response = refund(client, order["order_id"])

    assert response.status_code == 200
    validate(contract_schema, "requestRefund", response)
    assert (response.json()["status"], response.json()["refundable"]) == ("refund_pending", False)
    assert account(client)["seconds_left"] == 0
    assert razorpay.refunds == [(f"pay_{order['order_id']}", 4000, {"order_id": order["order_id"], "user_id": "local"})]
    [listed] = purchases(client)
    assert (listed["status"], listed["refundable"]) == ("refund_pending", False)
    validate(contract_schema, "listPurchases", client.get("/api/payments"))


def test_asking_twice_refunds_once(client, razorpay):
    order, _ = pay(client)
    assert refund(client, order["order_id"]).status_code == 200

    second = refund(client, order["order_id"])

    assert second.status_code == 409
    assert second.json() == {"code": "refund_not_allowed", "detail": "A refund for this purchase is already in progress."}
    assert len(razorpay.refunds) == 1


def test_a_partly_used_pack_isnt_refundable(client, razorpay):
    order, _ = pay(client)
    use_up_free(client)
    assert transcribe(client).status_code == 200  # spends some paid time

    assert purchases(client)[0]["refundable"] is False
    response = refund(client, order["order_id"])
    assert response.status_code == 409
    assert "has been used" in response.json()["detail"]
    assert razorpay.refunds == []


@pytest.mark.parametrize("age, allowed", [(timedelta(days=7), True), (timedelta(days=7, seconds=1), False)])
def test_the_seven_day_window(client, age, allowed):
    order, _ = pay(client)
    set_paid_at(client, order["order_id"], utc_now() - age)

    assert purchases(client)[0]["refundable"] is allowed
    response = refund(client, order["order_id"])
    assert response.status_code == (200 if allowed else 409)
    if not allowed:
        assert response.json()["detail"] == "This pack was bought more than 7 days ago, so it can't be refunded."


def test_someone_elses_an_unknown_or_an_unpaid_order_is_404(client, razorpay):
    store = client.app.state.billing
    store.add_order(Order("order_theirs", "someone-else", "session_1", 4000, 3600, "created"))
    store.mark_paid("order_theirs", "pay_theirs")
    unpaid = client.post("/api/payments/orders", json={"pack_id": "session_1"}).json()

    for order_id in ("order_theirs", "order_nope", unpaid["order_id"]):
        response = refund(client, order_id)
        assert response.status_code == 404
        assert response.json()["code"] == "order_not_found"
    assert razorpay.refunds == []


def test_razorpay_refusing_puts_the_time_back(tmp_path, caplog):
    with TestClient(metered_app(tmp_path, FakeRazorpay(refund_fails=True)), base_url="http://localhost") as client:
        order, _ = pay(client)

        response = refund(client, order["order_id"])

        assert response.status_code == 502
        assert response.json()["code"] == "payment_provider_failed"
        assert account(client)["seconds_left"] == 3600
        assert (purchases(client)[0]["status"], purchases(client)[0]["refundable"]) == ("paid", True)
    [record] = [r for r in caplog.records if "failed at Razorpay" in r.getMessage()]
    assert record.levelname == "ERROR" and KEY_SECRET not in record.getMessage()


def test_without_payments_a_refund_is_503(tmp_path):
    with TestClient(create_app(Settings(transcriber="fake", data_file=tmp_path / "q.json")), base_url="http://localhost") as c:
        assert refund(c, "order_1").json()["code"] == "payments_unavailable"


# --- Razorpay's refund webhooks ----------------------------------------------------------


def test_refund_processed_marks_a_pending_refund_refunded(client):
    order, _ = pay(client)
    refund(client, order["order_id"])

    assert webhook(client, refund_event("refund.processed", f"pay_{order['order_id']}", 4000)).json() == {"status": "ok"}

    assert purchases(client)[0]["status"] == "refunded"
    assert account(client)["seconds_left"] == 0
    # A repeat delivery changes nothing.
    webhook(client, refund_event("refund.processed", f"pay_{order['order_id']}", 4000))
    assert account(client)["seconds_left"] == 0


def test_a_refund_made_in_razorpays_dashboard_takes_the_time_back(client):
    order, _ = pay(client)

    webhook(client, refund_event("refund.processed", f"pay_{order['order_id']}", 4000))

    assert purchases(client)[0]["status"] == "refunded"
    assert account(client)["seconds_left"] == 0


def test_refund_failed_puts_the_time_back(client, caplog):
    order, _ = pay(client)
    refund(client, order["order_id"])

    webhook(client, refund_event("refund.failed", f"pay_{order['order_id']}", 4000))

    assert purchases(client)[0]["status"] == "paid"
    assert account(client)["seconds_left"] == 3600
    assert any(r.levelname == "ERROR" and "failed at Razorpay" in r.getMessage() for r in caplog.records)


def test_partial_or_unknown_refunds_are_left_alone(client):
    order, _ = pay(client)

    assert webhook(client, refund_event("refund.processed", f"pay_{order['order_id']}", 1000)).json() == {"status": "ignored"}
    assert webhook(client, refund_event("refund.processed", "pay_unknown", 4000)).json() == {"status": "ignored"}
    assert webhook(client, {"event": "refund.processed", "payload": {}}).json() == {"status": "ignored"}

    assert (purchases(client)[0]["status"], account(client)["seconds_left"]) == ("paid", 3600)


def test_a_late_payment_webhook_after_a_refund_credits_nothing(client):
    order, _ = pay(client)
    refund(client, order["order_id"])
    webhook(client, refund_event("refund.processed", f"pay_{order['order_id']}", 4000))

    webhook(client, captured(order["order_id"], 4000, payment_id=f"pay_{order['order_id']}"))

    assert (purchases(client)[0]["status"], account(client)["seconds_left"]) == ("refunded", 0)


# --- Razorpay client ---------------------------------------------------------------------


def test_refund_calls_razorpays_refund_api(monkeypatch):
    calls = []

    def fake_request(method, url, auth, timeout, json):
        calls.append((method, url, auth, json))
        return httpx.Response(200, json={"id": "rfnd_1", "status": "pending"})

    monkeypatch.setattr(httpx, "request", fake_request)

    assert Razorpay("rzp_test_key", KEY_SECRET).refund("pay_1", 4000, {"order_id": "order_1"}) == "rfnd_1"
    assert calls == [(
        "POST", "https://api.razorpay.com/v1/payments/pay_1/refund", ("rzp_test_key", KEY_SECRET),
        {"amount": 4000, "speed": "normal", "notes": {"order_id": "order_1"}},
    )]


def test_a_refused_refund_raises_without_the_secret(monkeypatch):
    monkeypatch.setattr(httpx, "request", lambda *a, **k: httpx.Response(400, json={"error": {"description": "insufficient balance"}}))

    with pytest.raises(RazorpayError) as error:
        Razorpay("rzp_test_key", KEY_SECRET).refund("pay_1", 4000, {})
    assert "HTTP 400" in str(error.value) and KEY_SECRET not in str(error.value)


# --- MySQL store -------------------------------------------------------------------------


def test_sql_refunds(mysql_engine, tmp_path):
    store = SqlBillingStore(mysql_engine)
    user = f"{tmp_path}/refunds"
    order = Order(f"order_r_{tmp_path.name}"[:64], user, "session_1", 4000, 3600, "created")
    store.add_order(order)
    store.mark_paid(order.id, f"pay_r_{tmp_path.name}"[:64])
    payment_id = store.get_order(order.id).payment_id

    assert store.order_for_payment(payment_id).id == order.id
    pending = store.start_refund(order.id)
    assert pending.status == "refund_pending" and store.balance(user) == Balance(3, 0)
    with pytest.raises(RefundRefused):
        store.start_refund(order.id)
    # The regression: a late payment webhook never credits it again.
    assert store.mark_paid(order.id, payment_id) == Balance(3, 0)

    store.refund_started(order.id, "rfnd_1")
    assert store.refund_failed(order.id) is True
    assert (store.get_order(order.id).status, store.balance(user)) == ("paid", Balance(3, 3600))
    assert store.refund_failed(order.id) is False

    assert store.refund_processed(order.id, "rfnd_2") == "paid"  # a dashboard refund
    done = store.get_order(order.id)
    assert (done.status, done.refund_id, store.balance(user)) == ("refunded", "rfnd_2", Balance(3, 0))
    assert done.refunded_at.endswith("Z")
    assert store.refund_processed(order.id, "rfnd_2") == "refunded"
    assert [p.status for p in store.purchases(user)] == ["refunded"]


def test_sql_refund_window_and_used_time(mysql_engine, tmp_path):
    store = SqlBillingStore(mysql_engine)
    user = f"{tmp_path}/window"
    order = Order(f"order_w_{tmp_path.name}"[:64], user, "session_1", 4000, 3600, "created")
    store.add_order(order)
    store.mark_paid(order.id, f"pay_w_{tmp_path.name}"[:64])
    for _ in range(3):
        store.charge(user, 10)
    store.charge(user, 10)  # 10 s of paid time used

    with pytest.raises(RefundRefused, match="has been used"):
        store.start_refund(order.id)
    assert store.balance(user) == Balance(0, 3590)

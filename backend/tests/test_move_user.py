"""app/admin/move_user.py: moving a user's data to a new Clerk id (needs UMLESS_TEST_DATABASE_URL)."""

from datetime import datetime

import pytest
from sqlalchemy import delete, insert, select

from app.admin.move_user import MoveRefused, move_user
from app.billing.sql import accounts, payment_orders
from app.questions.sql import questions
from app.takes.domain import object_name
from app.takes.objects import InMemoryObjects
from app.takes.sql import takes

OLD, NEW = "user_dev123", "user_live456"
NOW = datetime(2026, 10, 31, 12, 0, 0)


@pytest.fixture
def engine(mysql_engine):
    with mysql_engine.begin() as conn:
        for table in (questions, takes, payment_orders, accounts):
            conn.execute(delete(table))
    return mysql_engine


def seed(engine, objects, user=OLD, free=1, seconds=3000):
    with engine.begin() as conn:
        conn.execute(insert(accounts).values(user_id=user, free_transcriptions_left=free, seconds_left=seconds, created_at=NOW))
        conn.execute(insert(questions).values(id="q" * 36, user_id=user, position=0, text="Tell me about you", created_at=NOW))
        for take_id in ("a" * 36, "b" * 36):
            conn.execute(insert(takes).values(id=take_id, user_id=user, question_id="q" * 36, created_at=NOW, duration_seconds=5.0, summary={}))
            objects.put(object_name(user, take_id), f'{{"take": "{take_id}"}}'.encode())
        conn.execute(insert(payment_orders).values(
            id="order_1", user_id=user, pack_id="session_1", amount_paise=4000, seconds=3600,
            status="paid", payment_id="pay_1", created_at=NOW, paid_at=NOW,
        ))


def owners(engine, table):
    with engine.connect() as conn:
        return sorted(set(conn.execute(select(table.c.user_id)).scalars()))


def account(engine, user):
    with engine.connect() as conn:
        row = conn.execute(select(accounts).where(accounts.c.user_id == user)).first()
    return None if row is None else (row.free_transcriptions_left, row.seconds_left)


def test_a_dry_run_reports_and_changes_nothing(engine):
    objects = InMemoryObjects()
    seed(engine, objects)

    report = move_user(engine, objects, OLD, NEW, apply=False)

    assert (report.questions, report.takes, report.orders) == (1, 2, 1)
    assert report.balance == "1 free, 3000 s paid"
    for table in (questions, takes, payment_orders, accounts):
        assert owners(engine, table) == [OLD]
    assert objects.get(object_name(NEW, "a" * 36)) is None


def test_apply_moves_rows_transcripts_and_balance(engine):
    objects = InMemoryObjects()
    seed(engine, objects)

    move_user(engine, objects, OLD, NEW, apply=True)

    for table in (questions, takes, payment_orders, accounts):
        assert owners(engine, table) == [NEW]
    assert account(engine, NEW) == (1, 3000)
    for take_id in ("a" * 36, "b" * 36):
        assert objects.get(object_name(NEW, take_id)) == f'{{"take": "{take_id}"}}'.encode()
        assert objects.get(object_name(OLD, take_id)) is None


def test_the_fresh_account_from_the_first_sign_in_is_merged_without_extra_free_ones(engine):
    objects = InMemoryObjects()
    seed(engine, objects, free=1, seconds=3000)
    with engine.begin() as conn:  # created by the first sign-in on production
        conn.execute(insert(accounts).values(user_id=NEW, free_transcriptions_left=3, seconds_left=0, created_at=NOW))

    move_user(engine, objects, OLD, NEW, apply=True)

    assert account(engine, NEW) == (1, 3000)
    assert account(engine, OLD) is None


def test_a_new_id_with_its_own_questions_is_refused(engine):
    objects = InMemoryObjects()
    seed(engine, objects)
    with engine.begin() as conn:
        conn.execute(insert(questions).values(id="n" * 36, user_id=NEW, position=0, text="New", created_at=NOW))

    with pytest.raises(MoveRefused, match="already has questions"):
        move_user(engine, objects, OLD, NEW, apply=True)
    assert owners(engine, takes) == [OLD]


def test_a_missing_transcript_is_reported_and_the_rest_still_moves(engine):
    objects = InMemoryObjects()
    seed(engine, objects)
    objects.delete(object_name(OLD, "a" * 36))

    report = move_user(engine, objects, OLD, NEW, apply=True)

    assert report.missing_transcripts == ["a" * 36]
    assert owners(engine, takes) == [NEW]
    assert objects.get(object_name(NEW, "b" * 36)) is not None


@pytest.mark.parametrize("old, new", [(OLD, OLD), ("", NEW), ("user_nobody", NEW)])
def test_bad_ids_are_refused(engine, old, new):
    with pytest.raises(MoveRefused):
        move_user(engine, InMemoryObjects(), old, new, apply=True)

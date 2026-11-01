"""Balances and payment orders in MySQL."""

from sqlalchemy import (
    Column,
    DateTime,
    Engine,
    Index,
    Integer,
    String,
    Table,
    func,
    insert,
    select,
    update,
)

from app.billing.store import (
    NEW_ACCOUNT,
    PAID_AT_FORMAT,
    PURCHASED,
    Balance,
    Order,
    RefundRefused,
    charged_seconds,
    refund_refusal,
    split_charge,
    utc_now,
)
from app.db import metadata

accounts = Table(
    "accounts",
    metadata,
    Column("user_id", String(255), primary_key=True),
    # Replaced by free_seconds_left (migration 0007); still written (0) so the previous release
    # can run after a rollback. Dropped in a later release.
    Column("free_transcriptions_left", Integer, nullable=False),
    Column("free_seconds_left", Integer, nullable=False, server_default="0"),
    Column("seconds_left", Integer, nullable=False),
    Column("created_at", DateTime, nullable=False),  # UTC
    # When paid time was last used (UTC); packs bought before then can't be refunded.
    Column("last_paid_use_at", DateTime, nullable=True),
    mysql_charset="utf8mb4",
    mysql_collate="utf8mb4_bin",
)

payment_orders = Table(
    "payment_orders",
    metadata,
    Column("id", String(64), primary_key=True),  # Razorpay order id
    Column("user_id", String(255), nullable=False),
    Column("pack_id", String(32), nullable=False),
    Column("amount_paise", Integer, nullable=False),
    Column("seconds", Integer, nullable=False),
    Column("status", String(16), nullable=False),  # created | paid | refund_pending | refunded
    Column("payment_id", String(64), nullable=True),
    Column("created_at", DateTime, nullable=False),
    Column("paid_at", DateTime, nullable=True),
    Column("refund_id", String(64), nullable=True),  # Razorpay's rfnd_...
    Column("refunded_at", DateTime, nullable=True),
    Index("ix_payment_orders_user_id", "user_id"),
    Index("ix_payment_orders_payment_id", "payment_id"),
    mysql_charset="utf8mb4",
    mysql_collate="utf8mb4_bin",
)


class SqlBillingStore:
    def __init__(self, engine: Engine) -> None:
        self._engine = engine

    @staticmethod
    def _ensure_account(conn, user_id: str) -> None:
        conn.execute(
            insert(accounts)
            .prefix_with("IGNORE")
            .values(
                user_id=user_id,
                free_transcriptions_left=0,
                free_seconds_left=NEW_ACCOUNT.free_seconds_left,
                seconds_left=NEW_ACCOUNT.seconds_left,
                created_at=utc_now(),
            )
        )

    @staticmethod
    def _read(conn, user_id: str) -> Balance:
        row = conn.execute(
            select(accounts.c.free_seconds_left, accounts.c.seconds_left, accounts.c.last_paid_use_at).where(
                accounts.c.user_id == user_id
            )
        ).first()
        if not row:
            return NEW_ACCOUNT
        used = row.last_paid_use_at.strftime(PAID_AT_FORMAT) if row.last_paid_use_at else None
        return Balance(row.free_seconds_left, row.seconds_left, used)

    def balance(self, user_id: str) -> Balance:
        with self._engine.connect() as conn:
            return self._read(conn, user_id)

    def charge(self, user_id: str, duration_seconds: float) -> Balance:
        mine = accounts.c.user_id == user_id
        with self._engine.begin() as conn:
            self._ensure_account(conn, user_id)
            # The row lock makes the read and the update one step: no double spending.
            conn.execute(select(accounts.c.user_id).where(mine).with_for_update())
            free, paid = split_charge(self._read(conn, user_id), charged_seconds(duration_seconds))
            conn.execute(
                update(accounts)
                .where(mine)
                .values(
                    free_seconds_left=accounts.c.free_seconds_left - free,
                    seconds_left=func.greatest(accounts.c.seconds_left - paid, 0),
                    # Paid time was used: packs bought before now are no longer refundable.
                    **({"last_paid_use_at": utc_now()} if paid > 0 else {}),
                )
            )
            return self._read(conn, user_id)

    def add_order(self, order: Order) -> None:
        with self._engine.begin() as conn:
            conn.execute(
                insert(payment_orders).values(
                    id=order.id,
                    user_id=order.user_id,
                    pack_id=order.pack_id,
                    amount_paise=order.amount_paise,
                    seconds=order.seconds,
                    status=order.status,
                    payment_id=order.payment_id,
                    created_at=utc_now(),
                )
            )

    def get_order(self, order_id: str) -> Order | None:
        with self._engine.connect() as conn:
            row = conn.execute(select(payment_orders).where(payment_orders.c.id == order_id)).first()
        return _order(row) if row else None

    def mark_paid(self, order_id: str, payment_id: str) -> Balance | None:
        with self._engine.begin() as conn:
            # The row lock makes the browser's verify and Razorpay's webhook credit only once.
            row = conn.execute(
                select(payment_orders).where(payment_orders.c.id == order_id).with_for_update()
            ).first()
            if row is None:
                return None
            self._ensure_account(conn, row.user_id)
            # Only an unpaid order: a refunded one is never credited again by a late webhook.
            if row.status == "created":
                conn.execute(
                    update(payment_orders)
                    .where(payment_orders.c.id == order_id)
                    .values(status="paid", payment_id=payment_id, paid_at=utc_now())
                )
                conn.execute(
                    update(accounts)
                    .where(accounts.c.user_id == row.user_id)
                    .values(seconds_left=accounts.c.seconds_left + row.seconds)
                )
            return self._read(conn, row.user_id)

    def purchases(self, user_id: str) -> list[Order]:
        query = (
            select(payment_orders)
            .where(payment_orders.c.user_id == user_id, payment_orders.c.status.in_(PURCHASED))
            .order_by(payment_orders.c.paid_at.desc(), payment_orders.c.id)
        )
        with self._engine.connect() as conn:
            return [_order(row) for row in conn.execute(query)]

    def order_for_payment(self, payment_id: str) -> Order | None:
        with self._engine.connect() as conn:
            row = conn.execute(select(payment_orders).where(payment_orders.c.payment_id == payment_id)).first()
        return _order(row) if row else None

    @staticmethod
    def _lock_order(conn, order_id: str):
        """The order, then its account, locked in that order (as mark_paid), so no deadlock."""
        row = conn.execute(select(payment_orders).where(payment_orders.c.id == order_id).with_for_update()).first()
        if row is None:
            raise KeyError(order_id)
        SqlBillingStore._ensure_account(conn, row.user_id)
        conn.execute(select(accounts.c.user_id).where(accounts.c.user_id == row.user_id).with_for_update())
        return row

    @staticmethod
    def _add_seconds(conn, user_id: str, seconds: int) -> None:
        conn.execute(
            update(accounts)
            .where(accounts.c.user_id == user_id)
            .values(seconds_left=func.greatest(accounts.c.seconds_left + seconds, 0))
        )

    @staticmethod
    def _set(conn, order_id: str, **values) -> None:
        conn.execute(update(payment_orders).where(payment_orders.c.id == order_id).values(**values))

    def start_refund(self, order_id: str) -> Order:
        with self._engine.begin() as conn:
            row = self._lock_order(conn, order_id)
            reason = refund_refusal(_order(row), self._read(conn, row.user_id), utc_now())
            if reason:
                raise RefundRefused(reason)
            self._add_seconds(conn, row.user_id, -row.seconds)
            self._set(conn, order_id, status="refund_pending")
            return _order(conn.execute(select(payment_orders).where(payment_orders.c.id == order_id)).one())

    def refund_started(self, order_id: str, refund_id: str) -> None:
        with self._engine.begin() as conn:
            self._set(conn, order_id, refund_id=refund_id)

    def cancel_refund(self, order_id: str) -> None:
        self.refund_failed(order_id)

    def refund_processed(self, order_id: str, refund_id: str) -> str:
        with self._engine.begin() as conn:
            row = self._lock_order(conn, order_id)
            if row.status in ("paid", "refund_pending"):
                if row.status == "paid":
                    self._add_seconds(conn, row.user_id, -row.seconds)
                self._set(conn, order_id, status="refunded", refund_id=refund_id, refunded_at=utc_now())
            return row.status

    def refund_failed(self, order_id: str) -> bool:
        with self._engine.begin() as conn:
            row = self._lock_order(conn, order_id)
            if row.status != "refund_pending":
                return False
            self._add_seconds(conn, row.user_id, row.seconds)
            self._set(conn, order_id, status="paid", refund_id=None)
            return True


def _order(row) -> Order:
    return Order(
        id=row.id,
        user_id=row.user_id,
        pack_id=row.pack_id,
        amount_paise=row.amount_paise,
        seconds=row.seconds,
        status=row.status,
        payment_id=row.payment_id,
        paid_at=row.paid_at.strftime(PAID_AT_FORMAT) if row.paid_at else None,
        refund_id=row.refund_id,
        refunded_at=row.refunded_at.strftime(PAID_AT_FORMAT) if row.refunded_at else None,
    )

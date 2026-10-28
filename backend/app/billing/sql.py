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

from app.billing.store import NEW_ACCOUNT, Balance, Order, charged_seconds, utc_now
from app.db import metadata

accounts = Table(
    "accounts",
    metadata,
    Column("user_id", String(255), primary_key=True),
    Column("free_transcriptions_left", Integer, nullable=False),
    Column("seconds_left", Integer, nullable=False),
    Column("created_at", DateTime, nullable=False),  # UTC
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
    Column("status", String(16), nullable=False),  # created | paid
    Column("payment_id", String(64), nullable=True),
    Column("created_at", DateTime, nullable=False),
    Column("paid_at", DateTime, nullable=True),
    Index("ix_payment_orders_user_id", "user_id"),
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
                free_transcriptions_left=NEW_ACCOUNT.free_transcriptions_left,
                seconds_left=NEW_ACCOUNT.seconds_left,
                created_at=utc_now(),
            )
        )

    @staticmethod
    def _read(conn, user_id: str) -> Balance:
        row = conn.execute(
            select(accounts.c.free_transcriptions_left, accounts.c.seconds_left).where(
                accounts.c.user_id == user_id
            )
        ).first()
        return Balance(row.free_transcriptions_left, row.seconds_left) if row else NEW_ACCOUNT

    def balance(self, user_id: str) -> Balance:
        with self._engine.connect() as conn:
            return self._read(conn, user_id)

    def charge(self, user_id: str, duration_seconds: float) -> Balance:
        mine = accounts.c.user_id == user_id
        with self._engine.begin() as conn:
            self._ensure_account(conn, user_id)
            # Atomic in the database: two requests at once can't both spend the last free one.
            used_free = conn.execute(
                update(accounts)
                .where(mine, accounts.c.free_transcriptions_left > 0)
                .values(free_transcriptions_left=accounts.c.free_transcriptions_left - 1)
            ).rowcount
            if not used_free:
                conn.execute(
                    update(accounts)
                    .where(mine)
                    .values(
                        seconds_left=func.greatest(
                            accounts.c.seconds_left - charged_seconds(duration_seconds), 0
                        )
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
            if row.status != "paid":
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


def _order(row) -> Order:
    return Order(
        id=row.id,
        user_id=row.user_id,
        pack_id=row.pack_id,
        amount_paise=row.amount_paise,
        seconds=row.seconds,
        status=row.status,
        payment_id=row.payment_id,
    )

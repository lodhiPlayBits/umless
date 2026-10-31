"""Move one user's data to a new Clerk user id (the Clerk production switch, roadmap Phase 4).

    docker compose exec backend python -m app.admin.move_user OLD_ID NEW_ID          # dry run
    docker compose exec backend python -m app.admin.move_user OLD_ID NEW_ID --apply

Moves questions, takes (rows and transcripts in the bucket), paid orders and the balance.
The new id may already have the account Clerk's first sign-in created (3 free, no time), but
nothing else: the user signs in once on production, then this runs, then they practise.
Take a backup first (`docker compose run --rm backup once`).
"""

import sys
from dataclasses import dataclass, field

from sqlalchemy import Engine, delete, func, select, update

from app.billing.sql import accounts, payment_orders
from app.questions.sql import questions
from app.takes.domain import object_name
from app.takes.objects import TranscriptObjects
from app.takes.sql import takes


class MoveRefused(Exception):
    pass


@dataclass
class Report:
    questions: int = 0
    takes: int = 0
    orders: int = 0
    balance: str = ""
    missing_transcripts: list[str] = field(default_factory=list)

    def lines(self) -> list[str]:
        out = [
            f"questions: {self.questions}",
            f"takes: {self.takes} (transcripts copied: {self.takes - len(self.missing_transcripts)})",
            f"payment orders: {self.orders}",
            f"balance: {self.balance}",
        ]
        if self.missing_transcripts:
            out.append(f"transcripts already missing from the bucket: {', '.join(self.missing_transcripts)}")
        return out


def _count(conn, table, user_id: str) -> int:
    return conn.execute(select(func.count()).select_from(table).where(table.c.user_id == user_id)).scalar_one()


def move_user(engine: Engine, objects: TranscriptObjects, old: str, new: str, apply: bool) -> Report:
    if not old or not new or old == new:
        raise MoveRefused("give two different user ids")
    report = Report()
    with engine.connect() as conn:
        report.questions = _count(conn, questions, old)
        report.orders = _count(conn, payment_orders, old)
        take_ids = list(conn.execute(select(takes.c.id).where(takes.c.user_id == old)).scalars())
        report.takes = len(take_ids)
        old_account = conn.execute(select(accounts).where(accounts.c.user_id == old)).first()
        new_account = conn.execute(select(accounts).where(accounts.c.user_id == new)).first()
        # Merging two lists would need positions renumbered and is never needed here.
        for table, what in ((questions, "questions"), (takes, "takes"), (payment_orders, "payment orders")):
            if _count(conn, table, new):
                raise MoveRefused(f"{new} already has {what}; move only into a fresh account")
    if old_account is None and not (report.questions or report.takes or report.orders):
        raise MoveRefused(f"{old} has no data")

    # Free transcriptions: never more than either account had (no fresh 3 on top of the old
    # ones). Paid time: both added up.
    if old_account is not None:
        free = old_account.free_transcriptions_left
        seconds = old_account.seconds_left
        if new_account is not None:
            free = min(free, new_account.free_transcriptions_left)
            seconds += new_account.seconds_left
        report.balance = f"{free} free, {seconds} s paid"
    else:
        report.balance = "unchanged (no account row for the old id)"

    # Transcripts are stored under the user id: copy first, so a failure leaves the old ones.
    for take_id in take_ids:
        data = objects.get(object_name(old, take_id))
        if data is None:
            report.missing_transcripts.append(take_id)
        elif apply:
            objects.put(object_name(new, take_id), data)
    if not apply:
        return report

    with engine.begin() as conn:
        for table in (questions, takes, payment_orders):
            conn.execute(update(table).where(table.c.user_id == old).values(user_id=new))
        if old_account is not None:
            if new_account is None:
                conn.execute(update(accounts).where(accounts.c.user_id == old).values(user_id=new))
            else:
                conn.execute(
                    update(accounts)
                    .where(accounts.c.user_id == new)
                    .values(free_transcriptions_left=free, seconds_left=seconds)
                )
                conn.execute(delete(accounts).where(accounts.c.user_id == old))
    # Only after the rows point at the new copies.
    for take_id in take_ids:
        if take_id not in report.missing_transcripts:
            objects.delete(object_name(old, take_id))
    return report


def main(argv: list[str]) -> int:
    args = [a for a in argv[1:] if a != "--apply"]
    apply = "--apply" in argv
    if len(args) != 2:
        print(__doc__)
        return 2
    from app.config import Settings
    from app.db import create_mysql_engine
    from app.takes.objects import OciObjects

    settings = Settings.from_env()
    if settings.database_url is None or not settings.oci_bucket:
        print("needs DB_HOST and OCI_BUCKET (run it in the backend container)")
        return 2
    engine = create_mysql_engine(settings.database_url)
    objects = OciObjects(settings.oci_namespace, settings.oci_bucket, settings.oci_region)
    try:
        report = move_user(engine, objects, args[0], args[1], apply)
    except MoveRefused as exc:
        print(f"Refused: {exc}")
        return 1
    finally:
        engine.dispose()
    print(("Moved" if apply else "Dry run, nothing changed. Would move") + f" {args[0]} -> {args[1]}:")
    for line in report.lines():
        print(f"  {line}")
    if not apply:
        print("Run again with --apply to do it.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))

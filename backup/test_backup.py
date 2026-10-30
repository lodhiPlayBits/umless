from datetime import datetime, timezone

from backup import backup_name, backups_to_delete, next_run

NOW = datetime(2026, 10, 31, 20, 30, tzinfo=timezone.utc)


def name(day: int, month: int = 10) -> str:
    return backup_name(datetime(2026, month, day, 20, 30, tzinfo=timezone.utc))


def test_names_sort_by_time():
    assert name(1) == "mysql/umless-20261001T203000Z.sql.gz"
    assert sorted([name(9), name(10), name(1, 11)]) == [name(9), name(10), name(1, 11)]


def test_dumps_older_than_the_window_are_deleted():
    names = [name(d) for d in range(1, 32)]

    # The cutoff is 2 Oct 20:30; a dump exactly at the cutoff is kept.
    assert backups_to_delete(names, NOW, keep_days=29, keep_min=7) == [name(1)]


def test_the_newest_are_kept_even_when_old():
    # Backups stopped in early October: the last 7 stay, however old.
    names = [name(d) for d in range(1, 11)]

    assert sorted(backups_to_delete(names, NOW, keep_days=1, keep_min=7)) == [name(1), name(2), name(3)]


def test_other_objects_are_left_alone():
    assert backups_to_delete(["mysql/notes.txt", "mysql/umless-bad.sql.gz"], NOW, 0, 0) == []


def test_next_run_is_later_today_or_tomorrow():
    morning = datetime(2026, 10, 31, 9, 0, tzinfo=timezone.utc)

    assert next_run(morning, "20:30") == datetime(2026, 10, 31, 20, 30, tzinfo=timezone.utc)
    assert next_run(NOW, "20:30") == datetime(2026, 11, 1, 20, 30, tzinfo=timezone.utc)

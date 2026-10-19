import json
import os
import re
import threading
from concurrent.futures import ThreadPoolExecutor

import pytest

from app.questions.repository import (
    JsonFileQuestionRepository,
    Question,
    QuestionFileError,
)

CREATED_AT = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")
UUID4 = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")


@pytest.fixture(params=[JsonFileQuestionRepository])
def make_repo(request):
    return request.param


@pytest.fixture
def path(tmp_path):
    return tmp_path / "q.json"


def texts(repo):
    return [q.text for q in repo.list()]


# --- contract suite -------------------------------------------------------


def test_add_returns_question_with_uuid4_id_text_and_utc_timestamp(make_repo, path):
    q = make_repo(path).add("Tell me about yourself")

    assert isinstance(q, Question)
    assert UUID4.match(q.id)
    assert q.text == "Tell me about yourself"
    assert CREATED_AT.match(q.created_at)


def test_add_appends_and_list_keeps_stored_order(make_repo, path):
    repo = make_repo(path)
    for t in ("a", "b", "c"):
        repo.add(t)

    assert texts(repo) == ["a", "b", "c"]


def test_empty_repository_lists_nothing(make_repo, path):
    assert make_repo(path).list() == []


def test_get_returns_question_by_id(make_repo, path):
    repo = make_repo(path)
    repo.add("a")
    b = repo.add("b")

    assert repo.get(b.id) == b


def test_get_unknown_id_returns_none(make_repo, path):
    assert make_repo(path).get("nope") is None


def test_update_changes_text_only(make_repo, path):
    repo = make_repo(path)
    repo.add("a")
    b = repo.add("b")
    repo.add("c")

    updated = repo.update(b.id, "new")

    assert updated == Question(id=b.id, text="new", created_at=b.created_at)
    assert repo.get(b.id) == updated
    assert texts(repo) == ["a", "new", "c"]


def test_update_unknown_id_returns_none_and_changes_nothing(make_repo, path):
    repo = make_repo(path)
    repo.add("a")

    assert repo.update("nope", "x") is None
    assert texts(repo) == ["a"]


def test_delete_removes_question_and_returns_true(make_repo, path):
    repo = make_repo(path)
    a = repo.add("a")
    b = repo.add("b")

    assert repo.delete(a.id) is True
    assert repo.get(a.id) is None
    assert repo.list() == [b]


def test_delete_unknown_id_returns_false(make_repo, path):
    repo = make_repo(path)
    repo.add("a")

    assert repo.delete("nope") is False
    assert texts(repo) == ["a"]


@pytest.mark.parametrize(
    ("position", "expected"),
    [
        (0, ["new", "a", "b", "c"]),
        (1, ["a", "new", "b", "c"]),
        (3, ["a", "b", "c", "new"]),
        (99, ["a", "b", "c", "new"]),
        (None, ["a", "b", "c", "new"]),
    ],
)
def test_add_with_position_inserts_at_index_or_appends_past_end(make_repo, path, position, expected):
    repo = make_repo(path)
    for t in ("a", "b", "c"):
        repo.add(t)

    repo.add("new", position)

    assert texts(repo) == expected


@pytest.mark.parametrize("mutation", ["add", "add_at_0", "update", "delete"])
def test_every_mutation_is_visible_to_a_new_repository(make_repo, path, mutation):
    repo = make_repo(path)
    a = repo.add("a")
    repo.add("b")

    if mutation == "add":
        repo.add("c")
    elif mutation == "add_at_0":
        repo.add("c", 0)
    elif mutation == "update":
        repo.update(a.id, "changed")
    else:
        repo.delete(a.id)

    assert make_repo(path).list() == repo.list()


def test_concurrent_adds_all_succeed_with_unique_ids(make_repo, path):
    repo = make_repo(path)
    barrier = threading.Barrier(20)

    def work(i):
        barrier.wait(timeout=10)
        return repo.add(f"q{i}")

    with ThreadPoolExecutor(max_workers=20) as pool:
        created = list(pool.map(work, range(20)))

    assert len({q.id for q in created}) == 20
    assert {q.id for q in repo.list()} == {q.id for q in created}
    assert {q.id for q in make_repo(path).list()} == {q.id for q in created}


# --- JSON file specifics --------------------------------------------------


def test_file_format_is_versioned_object_with_exact_keys(path):
    q = JsonFileQuestionRepository(path).add("hello")

    data = json.loads(path.read_bytes().decode("utf-8"))
    assert data == {
        "version": 1,
        "questions": [{"id": q.id, "text": "hello", "created_at": q.created_at}],
    }


def test_non_ascii_text_is_stored_readable_in_utf8(path):
    JsonFileQuestionRepository(path).add("héllo 世界 😀")

    raw = path.read_bytes().decode("utf-8")
    assert "héllo 世界 😀" in raw
    assert "\\u" not in raw


def test_missing_file_loads_empty_and_is_not_created(path):
    repo = JsonFileQuestionRepository(path)

    assert repo.list() == []
    assert not path.exists()


def test_first_write_creates_missing_parent_directories(tmp_path):
    path = tmp_path / "a" / "b" / "q.json"

    JsonFileQuestionRepository(path).add("x")

    assert path.is_file()


def test_stale_tmp_file_is_ignored_on_load_and_does_not_break_write(path):
    JsonFileQuestionRepository(path).add("a")
    path.with_name(path.name + ".tmp").write_bytes(b"garbage{{")

    repo = JsonFileQuestionRepository(path)
    assert texts(repo) == ["a"]
    repo.add("b")

    assert texts(JsonFileQuestionRepository(path)) == ["a", "b"]


def test_transient_permission_errors_on_replace_are_retried(path):
    calls = {"n": 0}

    def flaky(src, dst):
        calls["n"] += 1
        if calls["n"] <= 5:
            raise PermissionError("locked")
        os.replace(src, dst)

    JsonFileQuestionRepository(path, replace=flaky, retry_delay=0).add("a")

    assert calls["n"] == 6
    assert texts(JsonFileQuestionRepository(path)) == ["a"]


@pytest.mark.parametrize("mutation", ["add", "update", "delete"])
def test_persistent_replace_failure_raises_and_leaves_state_unchanged(path, mutation):
    JsonFileQuestionRepository(path).add("a")
    before_bytes = path.read_bytes()
    failing = {"on": False}

    def replace(src, dst):
        if failing["on"]:
            raise PermissionError("locked")
        os.replace(src, dst)

    repo = JsonFileQuestionRepository(path, replace=replace, retry_delay=0)
    before = repo.list()
    failing["on"] = True

    with pytest.raises(Exception):
        if mutation == "add":
            repo.add("b")
        elif mutation == "update":
            repo.update(before[0].id, "z")
        else:
            repo.delete(before[0].id)

    assert repo.list() == before
    assert path.read_bytes() == before_bytes


def _item(**over):
    item = {"id": "id1", "text": "hi", "created_at": "2026-01-01T00:00:00Z"}
    item.update(over)
    return item


def _doc(*items, **over):
    doc = {"version": 1, "questions": list(items) or [_item()]}
    doc.update(over)
    return doc


def _dump(obj):
    return json.dumps(obj).encode("utf-8")


BAD_FILES = {
    "empty": b"",
    "invalid_json": b"{not json",
    "top_level_list": b"[]",
    "version_missing": _dump({"questions": []}),
    "version_2": _dump(_doc(version=2)),
    "version_true": _dump(_doc(version=True)),
    "questions_not_list": _dump({"version": 1, "questions": {}}),
    "item_missing_key": _dump(_doc({"id": "a", "text": "t"})),
    "item_extra_key": _dump(_doc(_item(extra=1))),
    "item_non_string_field": _dump(_doc(_item(text=5))),
    "duplicate_ids": _dump(_doc(_item(), _item())),
    "text_too_long": _dump(_doc(_item(), _item(id="id2", text="x" * 501))),
    "text_empty": _dump(_doc(_item(), _item(id="id2", text=""))),
    "text_whitespace": _dump(_doc(_item(), _item(id="id2", text="  　 "))),
    "text_lone_surrogate": b'{"version": 1, "questions": [{"id": "id1", "text": "a\\ud800", '
    b'"created_at": "2026-01-01T00:00:00Z"}]}',
}


@pytest.mark.parametrize("name", sorted(BAD_FILES))
def test_invalid_file_fails_startup_naming_path_and_leaves_bytes(path, name):
    path.write_bytes(BAD_FILES[name])

    with pytest.raises(QuestionFileError) as exc:
        JsonFileQuestionRepository(path)

    assert str(path) in str(exc.value)
    assert path.read_bytes() == BAD_FILES[name]


@pytest.mark.parametrize("name", ["text_empty", "text_whitespace"])
def test_blank_text_error_names_the_item_index(path, name):
    path.write_bytes(BAD_FILES[name])

    with pytest.raises(QuestionFileError, match=r"\b1\b"):
        JsonFileQuestionRepository(path)


def test_text_of_exactly_500_code_points_is_accepted(path):
    path.write_bytes(_dump(_doc(_item(text="\U0001f600" * 500))))

    assert len(JsonFileQuestionRepository(path).list()[0].text) == 500


def test_file_with_utf8_bom_loads(path):
    path.write_bytes(b"\xef\xbb\xbf" + _dump(_doc()))

    assert texts(JsonFileQuestionRepository(path)) == ["hi"]

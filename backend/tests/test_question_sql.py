"""MySQL question store: what the shared repository suite can't show (one user per test there)."""

import pytest
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from fastapi.testclient import TestClient

import app.billing.sql  # noqa: F401  (registers the billing tables in metadata)
import app.takes.sql  # noqa: F401  (registers the takes table in metadata)
from app.config import Settings, database_url
from app.db import metadata
from app.main import create_app

DB_VALUES = {"DB_HOST": "10.0.0.230", "DB_USER": "umless", "DB_PASSWORD": "p@ss:w/rd#1", "DB_NAME": "umless"}


def test_users_never_see_each_others_questions(mysql_store, tmp_path):
    alice = mysql_store.for_user(f"{tmp_path}/alice")
    bob = mysql_store.for_user(f"{tmp_path}/bob")
    question = alice.add("Alice's question")
    bob.add("Bob's question")

    assert [q.text for q in alice.list()] == ["Alice's question"]
    assert bob.get(question.id) is None
    assert bob.update(question.id, "taken over") is None
    assert bob.delete(question.id) is False
    assert alice.get(question.id) == question


def test_user_ids_that_differ_only_in_case_are_different_users(mysql_store, tmp_path):
    mysql_store.for_user(f"{tmp_path}/user_A").add("upper")

    assert mysql_store.for_user(f"{tmp_path}/user_a").list() == []


def test_delete_keeps_positions_dense_so_undo_reinserts_at_the_same_index(mysql_store, tmp_path):
    repo = mysql_store.for_user(str(tmp_path))
    a, b, c = (repo.add(t) for t in "abc")
    repo.delete(b.id)
    repo.add("b again", position=1)

    assert [q.text for q in repo.list()] == ["a", "b again", "c"]


def test_migrations_create_exactly_the_tables_the_code_uses(mysql_engine):
    with mysql_engine.connect() as conn:
        diff = compare_metadata(MigrationContext.configure(conn), metadata)

    assert diff == []


def test_api_stores_questions_in_mysql_when_configured(mysql_engine):
    settings = Settings(transcriber="fake", database_url=mysql_engine.url)
    with TestClient(create_app(settings), base_url="http://localhost") as client:
        created = client.post("/api/questions", json={"text": "  Stored in MySQL  "})
        listed = client.get("/api/questions")

    assert created.status_code == 201
    assert created.json() in listed.json()["items"]
    assert created.json()["text"] == "Stored in MySQL"


def test_database_url_is_none_without_db_host():
    assert database_url({"DB_USER": "umless"}) is None


def test_database_url_escapes_a_password_with_url_characters():
    url = database_url({**DB_VALUES, "DB_PORT": "3306"})

    assert url.password == "p@ss:w/rd#1"
    assert (url.host, url.port, url.database) == ("10.0.0.230", 3306, "umless")
    assert url.query == {"charset": "utf8mb4"}


@pytest.mark.parametrize("name", ["DB_USER", "DB_PASSWORD", "DB_NAME"])
def test_database_url_names_a_missing_setting(name):
    with pytest.raises(ValueError, match=name):
        database_url({**DB_VALUES, name: ""})


def test_settings_repr_hides_the_database_password():
    settings = Settings(database_url=database_url(DB_VALUES))

    assert "p@ss" not in repr(settings)

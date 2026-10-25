"""Saved takes: transcripts kept per user and question, in object storage plus a record."""

import json

import oci
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.takes.domain import Take, object_name
from app.takes.objects import InMemoryObjects, OciObjects, StorageError
from app.takes.repository import InMemoryTakeStore
from app.takes.sql import SqlTakeStore
from tests.auth_tokens import make_token, require_sign_in

AUDIO = b"\x00\x01fake-audio-bytes\xff"
MISSING_ID = "3f2c8a9e-6b1d-4c0e-9a57-2d8e1f4b7c10"
SUMMARY = {
    "word_count": 1,
    "filler_count": 0,
    "fillers": [],
    "words_per_minute": 60,
    "fillers_per_minute": 0.0,
    "pause_count": 0,
    "longest_pause_seconds": None,
}


class FailingObjects(InMemoryObjects):
    """A bucket that refuses chosen operations, like one missing its IAM policy."""

    def __init__(self, fail=("put", "get", "delete")):
        super().__init__()
        self.fail = set(fail)

    def put(self, name, data):
        if "put" in self.fail:
            raise StorageError("put: HTTP 404 BucketNotFound")
        super().put(name, data)

    def get(self, name):
        if "get" in self.fail:
            raise StorageError("get: HTTP 503")
        return super().get(name)

    def delete(self, name):
        if "delete" in self.fail:
            raise StorageError("delete: HTTP 503")
        super().delete(name)


class NeverCalledTranscriber:
    async def transcribe(self, audio, content_type):
        raise AssertionError("Deepgram must not be called")


@pytest.fixture
def client(tmp_path):
    settings = Settings(transcriber="fake", data_file=tmp_path / "q.json")
    with TestClient(create_app(settings), base_url="http://localhost") as c:
        yield c


def add_question(client, text="Tell me about yourself", headers=None):
    response = client.post("/api/questions", json={"text": text}, headers=headers)
    assert response.status_code == 201
    return response.json()


def transcribe(client, question_id=None, headers=None):
    params = {"questionId": question_id} if question_id else None
    return client.post(
        "/api/transcriptions",
        params=params,
        content=AUDIO,
        headers={"Content-Type": "audio/webm", **(headers or {})},
    )


def validate(contract_schema, operation_id, response):
    contract_schema.find_operation_by_id(operation_id).validate_response(response)


# --- saving ------------------------------------------------------------------------------


def test_transcribing_for_a_question_saves_a_take(client, contract_schema):
    question = add_question(client)
    response = transcribe(client, question["id"])

    assert response.status_code == 200
    take_id = response.json()["take_id"]
    assert take_id
    validate(contract_schema, "createTranscription", response)

    listed = client.get(f"/api/questions/{question['id']}/takes")
    assert listed.status_code == 200
    validate(contract_schema, "listTakes", listed)
    [summary] = listed.json()["items"]
    assert summary["id"] == take_id
    assert summary["question_id"] == question["id"]
    assert summary["summary"] == response.json()["summary"]

    take = client.get(f"/api/takes/{take_id}")
    assert take.status_code == 200
    validate(contract_schema, "getTake", take)
    expected = {k: v for k, v in response.json().items() if k != "take_id"}
    assert take.json()["transcript"] == expected


def test_transcribing_without_a_question_saves_nothing(client):
    question = add_question(client)
    response = transcribe(client)

    assert response.status_code == 200
    assert "take_id" not in response.json()
    assert client.get(f"/api/questions/{question['id']}/takes").json() == {"items": []}


def test_an_unknown_question_is_404_before_deepgram_is_called(tmp_path, contract_schema):
    settings = Settings(transcriber="fake", data_file=tmp_path / "q.json")
    app = create_app(settings)
    from app.transcription.router import get_transcriber

    app.dependency_overrides[get_transcriber] = lambda: NeverCalledTranscriber()
    with TestClient(app, base_url="http://localhost") as c:
        response = transcribe(c, MISSING_ID)

    assert response.status_code == 404
    assert response.json()["code"] == "question_not_found"
    validate(contract_schema, "createTranscription", response)


def test_takes_are_listed_newest_first(client):
    question = add_question(client)
    ids = [transcribe(client, question["id"]).json()["take_id"] for _ in range(3)]

    listed = client.get(f"/api/questions/{question['id']}/takes").json()["items"]
    assert [t["id"] for t in listed] == list(reversed(ids))


def test_the_bucket_holds_the_transcript_with_a_question_snapshot(client):
    question = add_question(client, "Why this job?")
    take_id = transcribe(client, question["id"]).json()["take_id"]

    document = json.loads(client.app.state.transcripts.get(object_name("local", take_id)))
    assert document["version"] == 1
    assert document["question_text"] == "Why this job?"
    assert document["transcript"]["text"]
    assert "take_id" not in document["transcript"]


def test_a_failed_save_still_returns_the_transcript(client):
    client.app.state.transcripts = FailingObjects(fail={"put"})
    question = add_question(client)

    response = transcribe(client, question["id"])

    assert response.status_code == 200
    assert response.json()["take_id"] is None
    assert response.json()["text"]
    assert client.get(f"/api/questions/{question['id']}/takes").json() == {"items": []}


def test_a_failed_record_removes_the_transcript_it_just_wrote(client):
    class FailingRecords:
        def add(self, take):
            raise RuntimeError("database down")

    objects = client.app.state.transcripts
    client.app.state.takes = type("Store", (), {"for_user": lambda self, user: FailingRecords()})()
    question = add_question(client)

    assert transcribe(client, question["id"]).json()["take_id"] is None
    assert objects._objects == {}


# --- reading and deleting ----------------------------------------------------------------


def test_listing_takes_of_an_unknown_question_is_404(client, contract_schema):
    response = client.get(f"/api/questions/{MISSING_ID}/takes")

    assert response.status_code == 404
    assert response.json()["code"] == "question_not_found"
    validate(contract_schema, "listTakes", response)


@pytest.mark.parametrize("method", ["GET", "DELETE"])
def test_an_unknown_take_is_404(client, contract_schema, method):
    response = client.request(method, f"/api/takes/{MISSING_ID}")

    assert response.status_code == 404
    assert response.json() == {"code": "take_not_found", "detail": "That take doesn't exist any more."}
    validate(contract_schema, "getTake" if method == "GET" else "deleteTake", response)


def test_deleting_a_take_removes_its_record_and_transcript(client, contract_schema):
    question = add_question(client)
    take_id = transcribe(client, question["id"]).json()["take_id"]

    response = client.delete(f"/api/takes/{take_id}")

    assert response.status_code == 204
    validate(contract_schema, "deleteTake", response)
    assert client.get(f"/api/takes/{take_id}").status_code == 404
    assert client.app.state.transcripts.get(object_name("local", take_id)) is None


@pytest.mark.parametrize("method, operation", [("GET", "getTake"), ("DELETE", "deleteTake")])
def test_an_unreachable_bucket_is_503_and_changes_nothing(client, contract_schema, method, operation):
    question = add_question(client)
    take_id = transcribe(client, question["id"]).json()["take_id"]
    stored = client.app.state.transcripts._objects
    failing = FailingObjects(fail={"get", "delete"})
    failing._objects = stored
    client.app.state.transcripts = failing

    response = client.request(method, f"/api/takes/{take_id}")

    assert response.status_code == 503
    assert response.json()["code"] == "storage_unavailable"
    validate(contract_schema, operation, response)
    assert [t["id"] for t in client.get(f"/api/questions/{question['id']}/takes").json()["items"]] == [take_id]


def test_deleting_a_question_deletes_its_takes(client):
    question = add_question(client)
    other = add_question(client, "Other question")
    take_id = transcribe(client, question["id"]).json()["take_id"]
    kept_id = transcribe(client, other["id"]).json()["take_id"]

    assert client.delete(f"/api/questions/{question['id']}").status_code == 204

    assert client.get(f"/api/takes/{take_id}").status_code == 404
    assert client.app.state.transcripts.get(object_name("local", take_id)) is None
    assert client.get(f"/api/takes/{kept_id}").status_code == 200


def test_deleting_a_question_succeeds_even_if_its_takes_cant_be_deleted(client):
    question = add_question(client)
    transcribe(client, question["id"])
    client.app.state.transcripts = FailingObjects(fail={"delete"})

    assert client.delete(f"/api/questions/{question['id']}").status_code == 204


# --- whose takes -------------------------------------------------------------------------


def test_takes_need_sign_in_and_are_private(tmp_path):
    settings = Settings(transcriber="fake", data_file=tmp_path / "q.json")
    alice = {"Authorization": f"Bearer {make_token('user_alice')}"}
    bob = {"Authorization": f"Bearer {make_token('user_bob')}"}
    with TestClient(require_sign_in(create_app(settings)), base_url="http://localhost") as c:
        # The local file store is one shared list; the takes are still per user.
        question = add_question(c, headers=alice)
        take_id = transcribe(c, question["id"], headers=alice).json()["take_id"]

        assert c.get(f"/api/takes/{take_id}").status_code == 401
        assert c.get(f"/api/questions/{question['id']}/takes").status_code == 401
        assert c.get(f"/api/takes/{take_id}", headers=bob).status_code == 404
        assert c.delete(f"/api/takes/{take_id}", headers=bob).status_code == 404
        assert c.get(f"/api/questions/{question['id']}/takes", headers=bob).json() == {"items": []}
        assert c.get(f"/api/takes/{take_id}", headers=alice).status_code == 200
        assert c.app.state.transcripts.get(object_name("user_alice", take_id)) is not None


def test_object_names_keep_each_user_in_their_own_folder():
    assert object_name("user_2abc", "t1") == "users/user_2abc/takes/t1.json"
    # A user id can't escape its folder.
    assert object_name("../other", "t1") == "users/..%2Fother/takes/t1.json"


# --- take stores -------------------------------------------------------------------------


def take(id, question_id="q1", created_at="2026-10-25T10:00:00Z"):
    return Take(id=id, question_id=question_id, created_at=created_at, duration_seconds=4.5, summary=SUMMARY)


@pytest.fixture(params=["memory", "mysql"])
def take_store(request):
    if request.param == "memory":
        return InMemoryTakeStore()
    return SqlTakeStore(request.getfixturevalue("mysql_engine"))


def test_take_store_round_trip_order_and_isolation(take_store, tmp_path):
    alice = take_store.for_user(f"{tmp_path}/alice")
    bob = take_store.for_user(f"{tmp_path}/bob")
    alice.add(take("a1", created_at="2026-10-25T10:00:00Z"))
    alice.add(take("a2", created_at="2026-10-25T11:00:00Z"))
    alice.add(take("a3", question_id="q2"))

    assert [t.id for t in alice.list("q1")] == ["a2", "a1"]
    assert alice.get("a1") == take("a1")
    assert bob.list("q1") == []
    assert bob.get("a1") is None
    assert bob.delete("a1") is False
    assert alice.delete("a1") is True
    assert alice.get("a1") is None


# --- OCI bucket client -------------------------------------------------------------------


class FakeOciClient:
    def __init__(self, error=None):
        self.objects = {}
        self.error = error

    def _maybe_fail(self):
        if self.error:
            raise self.error

    def put_object(self, namespace, bucket, name, data, content_type=None):
        self._maybe_fail()
        assert (namespace, bucket, content_type) == ("ns", "bucket", "application/json")
        self.objects[name] = data

    def get_object(self, namespace, bucket, name):
        self._maybe_fail()
        if name not in self.objects:
            raise service_error(404, "ObjectNotFound")
        content = self.objects[name]
        return type("Response", (), {"data": type("Data", (), {"content": content})()})()

    def delete_object(self, namespace, bucket, name):
        self._maybe_fail()
        if name not in self.objects:
            raise service_error(404, "ObjectNotFound")
        del self.objects[name]


def service_error(status, code):
    return oci.exceptions.ServiceError(status, code, {}, "message from OCI")


def test_oci_objects_put_get_and_delete():
    objects = OciObjects("ns", "bucket", "ap-mumbai-1", client=FakeOciClient())

    objects.put("users/u/takes/t.json", b"{}")

    assert objects.get("users/u/takes/t.json") == b"{}"
    objects.delete("users/u/takes/t.json")
    assert objects.get("users/u/takes/t.json") is None
    objects.delete("users/u/takes/t.json")  # already gone: not an error


@pytest.mark.parametrize("operation", ["put", "get", "delete"])
@pytest.mark.parametrize(
    "error", [service_error(403, "NotAuthorizedOrNotFound"), ConnectionError("timed out")]
)
def test_oci_failures_become_storage_errors(operation, error):
    objects = OciObjects("ns", "bucket", "ap-mumbai-1", client=FakeOciClient(error))
    call = {"put": lambda: objects.put("x", b"{}"), "get": lambda: objects.get("x"), "delete": lambda: objects.delete("x")}

    with pytest.raises(StorageError):
        call[operation]()


def test_oci_client_is_not_created_at_startup(tmp_path):
    # Creating it signs in as the instance; a missing policy must not stop the server.
    settings = Settings(
        transcriber="fake",
        data_file=tmp_path / "q.json",
        oci_namespace="ns",
        oci_bucket="bucket",
        oci_region="ap-mumbai-1",
    )
    with TestClient(create_app(settings), base_url="http://localhost") as c:
        assert isinstance(c.app.state.transcripts, OciObjects)
        assert c.app.state.transcripts._client is None


# --- settings ----------------------------------------------------------------------------


def test_settings_read_the_bucket(monkeypatch):
    monkeypatch.setenv("OCI_BUCKET", "bucket-20261024-1540")
    monkeypatch.setenv("OCI_NAMESPACE", "bmej3eov9wnf")
    monkeypatch.setenv("OCI_REGION", "ap-mumbai-1")

    s = Settings.from_env(env_files=())

    assert (s.oci_bucket, s.oci_namespace, s.oci_region) == ("bucket-20261024-1540", "bmej3eov9wnf", "ap-mumbai-1")


def test_a_bucket_without_namespace_and_region_is_refused(monkeypatch):
    monkeypatch.setenv("OCI_BUCKET", "bucket")
    monkeypatch.delenv("OCI_NAMESPACE", raising=False)
    monkeypatch.delenv("OCI_REGION", raising=False)

    with pytest.raises(ValueError, match="OCI_NAMESPACE, OCI_REGION"):
        Settings.from_env(env_files=())


def test_a_database_without_a_bucket_is_refused(monkeypatch):
    for name, value in {
        "DB_HOST": "db",
        "DB_USER": "u",
        "DB_PASSWORD": "p",
        "DB_NAME": "n",
        "CLERK_PUBLISHABLE_KEY": "pk_test_c3RhYmxlLWZpc2gtNDkzMC5jbGVyay5hY2NvdW50cy5kZXYk",
        "CLERK_AUTHORIZED_PARTIES": "https://umless.in",
    }.items():
        monkeypatch.setenv(name, value)
    monkeypatch.delenv("OCI_BUCKET", raising=False)

    with pytest.raises(ValueError, match="OCI_BUCKET"):
        Settings.from_env(env_files=())

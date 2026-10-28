"""Where take transcripts are kept: an OCI Object Storage bucket, or memory for local use."""

import logging
import threading
from typing import Protocol

logger = logging.getLogger(__name__)


class StorageError(Exception):
    """The bucket couldn't be reached or refused the request. Messages hold no secrets."""


class TranscriptObjects(Protocol):
    def put(self, name: str, data: bytes) -> None: ...

    def get(self, name: str) -> bytes | None:
        """The object's bytes, or None if there is no such object."""
        ...

    def delete(self, name: str) -> None:
        """Deleting a missing object is not an error."""
        ...


class InMemoryObjects:
    """For local use without a bucket: kept until the server stops."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._objects: dict[str, bytes] = {}

    def put(self, name: str, data: bytes) -> None:
        with self._lock:
            self._objects[name] = data

    def get(self, name: str) -> bytes | None:
        with self._lock:
            return self._objects.get(name)

    def delete(self, name: str) -> None:
        with self._lock:
            self._objects.pop(name, None)


class OciObjects:
    """One OCI bucket, reached as this VM (instance principal): no keys in the app.

    Needs a dynamic group matching the instance and a policy letting it manage objects in the
    bucket (README, "Deploy"). The client is created on first use, so a missing policy or a
    metadata-service hiccup fails that request, not the server's startup.
    """

    def __init__(self, namespace: str, bucket: str, region: str, client=None) -> None:
        self._namespace = namespace
        self._bucket = bucket
        self._region = region
        self._client = client
        self._client_lock = threading.Lock()

    def _object_storage(self):
        with self._client_lock:
            if self._client is None:
                import oci  # imported here: large, and only needed with a bucket configured

                try:
                    signer = oci.auth.signers.InstancePrincipalsSecurityTokenSigner()
                except Exception as exc:
                    raise StorageError(f"instance principal sign-in failed: {type(exc).__name__}") from exc
                self._client = oci.object_storage.ObjectStorageClient(
                    {"region": self._region}, signer=signer, timeout=(5, 30)
                )
            return self._client

    def _call(self, action: str, name: str, call):
        import oci

        try:
            return call(self._object_storage())
        except oci.exceptions.ServiceError as exc:
            if exc.status == 404 and action != "put":
                return None
            raise StorageError(f"{action} {name}: HTTP {exc.status} {exc.code}") from exc
        except StorageError:
            raise
        except Exception as exc:  # timeouts, connection errors, signer refresh failures
            raise StorageError(f"{action} {name}: {type(exc).__name__}") from exc

    def put(self, name: str, data: bytes) -> None:
        self._call(
            "put",
            name,
            lambda c: c.put_object(
                self._namespace, self._bucket, name, data, content_type="application/json"
            ),
        )

    def get(self, name: str) -> bytes | None:
        response = self._call(
            "get", name, lambda c: c.get_object(self._namespace, self._bucket, name)
        )
        return None if response is None else response.data.content

    def delete(self, name: str) -> None:
        self._call("delete", name, lambda c: c.delete_object(self._namespace, self._bucket, name))

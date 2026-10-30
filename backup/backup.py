"""Nightly MySQL backups to an OCI bucket (docs/runbooks/backups.md).

    python3 backup.py run                 # dump now, then every day at BACKUP_TIME_UTC (the service)
    python3 backup.py once                # one dump and upload
    python3 backup.py fetch-latest PATH   # download the newest dump, for a restore

The bucket is reached as this VM (instance principal), like the backend's transcripts bucket.
The free MySQL HeatWave tier keeps only 1 day of its own backups, so these are the main copy.
"""

# The mysql:8.4 image has Python 3.9: annotations like `str | None` must stay unevaluated.
from __future__ import annotations

import gzip
import logging
import os
import shutil
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

logger = logging.getLogger("backup")

PREFIX = "mysql/"
# Written after each successful upload; the container healthcheck reads its age.
STATUS_FILE = Path("/tmp/last-success")


def backup_name(now: datetime) -> str:
    return f"{PREFIX}umless-{now:%Y%m%dT%H%M%SZ}.sql.gz"


def backups_to_delete(names: list[str], now: datetime, keep_days: int, keep_min: int) -> list[str]:
    """Dumps older than keep_days, but never the newest keep_min: if backups stop working,
    the old ones stay instead of all ageing out."""
    dated = []
    for name in names:
        try:
            stamp = datetime.strptime(name, f"{PREFIX}umless-%Y%m%dT%H%M%SZ.sql.gz").replace(tzinfo=timezone.utc)
        except ValueError:
            continue  # not ours; leave it alone
        dated.append((stamp, name))
    dated.sort(reverse=True)
    cutoff = now - timedelta(days=keep_days)
    return [name for stamp, name in dated[keep_min:] if stamp < cutoff]


def next_run(now: datetime, at_utc: str) -> datetime:
    hour, minute = (int(part) for part in at_utc.split(":"))
    run = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
    return run if run > now else run + timedelta(days=1)


def env(name: str, default: str | None = None) -> str:
    value = (os.environ.get(name) or default or "").strip()
    if not value:
        sys.exit(f"set {name} in backup/.env")
    return value


def object_storage():
    import oci

    signer = oci.auth.signers.InstancePrincipalsSecurityTokenSigner()
    return oci.object_storage.ObjectStorageClient(
        {"region": env("OCI_REGION")}, signer=signer, timeout=(10, 300)
    )


def list_backups(client) -> list[str]:
    import oci

    objects = oci.pagination.list_call_get_all_results(
        client.list_objects, env("OCI_NAMESPACE"), env("BACKUP_BUCKET"), prefix=PREFIX
    ).data.objects
    return [o.name for o in objects]


def dump(path: Path) -> None:
    """mysqldump of the whole database, gzipped. --single-transaction: a consistent snapshot
    without locking the live tables."""
    command = [
        "mysqldump",
        "--host", env("DB_HOST"),
        "--port", env("DB_PORT", "3306"),
        "--user", env("DB_USER"),
        "--single-transaction",
        "--routines",
        "--triggers",
        "--set-gtid-purged=OFF",  # HeatWave uses GTIDs; a restore elsewhere must not need them
        "--no-tablespaces",  # needs PROCESS, which the app's user doesn't have
        env("DB_NAME"),
    ]
    # The password goes in the environment, never on the command line (visible in ps).
    child_env = {**os.environ, "MYSQL_PWD": env("DB_PASSWORD")}
    with gzip.open(path, "wb") as out:
        process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=child_env)
        shutil.copyfileobj(process.stdout, out)
        _, stderr = process.communicate()
    if process.returncode != 0:
        raise RuntimeError(f"mysqldump failed ({process.returncode}): {stderr.decode().strip()}")


def backup_once() -> None:
    now = datetime.now(timezone.utc)
    name = backup_name(now)
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "dump.sql.gz"
        started = time.monotonic()
        dump(path)
        size = path.stat().st_size
        client = object_storage()
        with path.open("rb") as body:
            client.put_object(env("OCI_NAMESPACE"), env("BACKUP_BUCKET"), name, body)
    logger.info("Uploaded %s (%.1f kB) in %.1f s", name, size / 1024, time.monotonic() - started)

    keep_days = int(env("BACKUP_KEEP_DAYS", "30"))
    for old in backups_to_delete(list_backups(client), now, keep_days, keep_min=7):
        client.delete_object(env("OCI_NAMESPACE"), env("BACKUP_BUCKET"), old)
        logger.info("Deleted %s (older than %d days)", old, keep_days)
    STATUS_FILE.write_text(now.isoformat())


def fetch_latest(target: Path) -> None:
    client = object_storage()
    names = sorted(list_backups(client))
    if not names:
        sys.exit("no backups in the bucket yet")
    response = client.get_object(env("OCI_NAMESPACE"), env("BACKUP_BUCKET"), names[-1])
    with target.open("wb") as out:
        for chunk in response.data.raw.stream(1024 * 1024, decode_content=False):
            out.write(chunk)
    logger.info("Downloaded %s to %s", names[-1], target)


def run_forever() -> None:
    at = env("BACKUP_TIME_UTC", "20:30")  # 02:00 in India
    next_run(datetime.now(timezone.utc), at)  # fail fast on a malformed time
    while True:
        try:
            backup_once()
        except Exception:
            # Logged at ERROR so Phase 3's error tracking can alert; the healthcheck goes
            # unhealthy after 26 h without a success.
            logger.exception("Backup failed")
        now = datetime.now(timezone.utc)
        wake = next_run(now, at)
        logger.info("Next backup at %s", wake.strftime("%Y-%m-%d %H:%M UTC"))
        time.sleep((wake - now).total_seconds())


def main(argv: list[str]) -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%SZ",
    )
    logging.Formatter.converter = time.gmtime
    command = argv[1] if len(argv) > 1 else "run"
    if command == "run":
        run_forever()
    elif command == "once":
        backup_once()
    elif command == "fetch-latest" and len(argv) == 3:
        fetch_latest(Path(argv[2]))
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main(sys.argv)

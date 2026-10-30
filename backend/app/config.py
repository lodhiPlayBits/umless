import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import dotenv_values
from sqlalchemy import URL

from app.auth import clerk_issuer
from app.log import LOG_LEVELS

BACKEND_DIR = Path(__file__).resolve().parents[1]
# backend/.env wins over a repo-root .env; real environment variables win over both.
ENV_FILES = (BACKEND_DIR / ".env", BACKEND_DIR.parent / ".env")
TRANSCRIBERS = {"deepgram", "fake"}
DEFAULT_DATA_FILE = BACKEND_DIR / "data" / "questions.json"
OCI_SETTINGS = ("OCI_BUCKET", "OCI_NAMESPACE", "OCI_REGION")

# Winner of the Phase 0 spike (docs/spike/2026-10-18-deepgram-phase0.md).
DEEPGRAM_MODEL = "nova-3"
DEEPGRAM_PARAMS = {
    "filler_words": "true",
    "smart_format": "true",
    "language": "en",
    # Opt out of Deepgram's model improvement program: the audio isn't kept for training.
    "mip_opt_out": "true",
}


@dataclass
class Settings:
    deepgram_api_key: str | None = field(default=None, repr=False)
    transcriber: str = "deepgram"
    deepgram_timeout_seconds: float = 60.0
    max_body_bytes: int = 25 * 1024 * 1024
    data_file: Path = DEFAULT_DATA_FILE
    # Set (from DB_HOST etc.): questions live in MySQL. Unset: in data_file (local, one user).
    database_url: URL | None = field(default=None, repr=False)
    # Set (from CLERK_PUBLISHABLE_KEY): every API call but health needs a Clerk session token.
    clerk_issuer: str | None = None
    # Origins the tokens may be issued to (the azp claim), e.g. ("https://umless.in",).
    clerk_authorized_parties: tuple[str, ...] = ()
    # Set (from OCI_BUCKET etc.): take transcripts go to this OCI bucket. Unset: kept in memory.
    oci_namespace: str | None = None
    oci_bucket: str | None = None
    oci_region: str | None = None
    # Set (from RAZORPAY_*): transcription is metered and paid for. Unset: unmetered (local use).
    razorpay_key_id: str | None = None
    razorpay_key_secret: str | None = field(default=None, repr=False)
    razorpay_webhook_secret: str | None = field(default=None, repr=False)
    # Set (from REDIS_URL): transcription limits are shared by every worker. Unset: in memory.
    redis_url: str | None = field(default=None, repr=False)
    # Per user, each clock hour; protects the Deepgram bill (docs/adr/0006-redis-limits.md).
    transcriptions_per_hour: int = 30
    # Set (from_env: UMLESS_LOG_LEVEL, default INFO): the lifespan starts queue logging (app/log.py).
    # None (tests building Settings directly): logging is left as it is, so pytest's capture works.
    log_level: str | None = None

    @classmethod
    def from_env(cls, env_files: tuple[Path, ...] = ENV_FILES) -> "Settings":
        values: dict[str, str | None] = {}
        for path in reversed(env_files):
            if path.is_file():
                values.update(dotenv_values(path))
        values.update(os.environ)
        transcriber = (values.get("UMLESS_TRANSCRIBER") or "deepgram").strip().lower()
        if transcriber not in TRANSCRIBERS:
            raise ValueError(
                f"UMLESS_TRANSCRIBER must be one of {sorted(TRANSCRIBERS)}, got {transcriber!r}"
            )
        # A relative path is resolved against backend/, so it doesn't depend on the CWD.
        data_file = values.get("UMLESS_DATA_FILE")
        database = database_url(values)
        publishable_key = (values.get("CLERK_PUBLISHABLE_KEY") or "").strip()
        parties = tuple(
            p.strip().rstrip("/") for p in (values.get("CLERK_AUTHORIZED_PARTIES") or "").split(",")
            if p.strip()
        )
        if publishable_key and not parties:
            raise ValueError(
                "CLERK_PUBLISHABLE_KEY is set, so CLERK_AUTHORIZED_PARTIES must list the site's"
                " origins, e.g. https://umless.in"
            )
        # The database keeps one list per user; without sign-in everyone would share one.
        if database is not None and not publishable_key:
            raise ValueError("DB_HOST is set, so CLERK_PUBLISHABLE_KEY must be set too")
        bucket = {name: (values.get(name) or "").strip() for name in OCI_SETTINGS}
        if bucket["OCI_BUCKET"] and not all(bucket.values()):
            missing = ", ".join(name for name, value in bucket.items() if not value)
            raise ValueError(f"OCI_BUCKET is set, so {missing} must be set too")
        # Takes in the database would point at transcripts lost on every restart.
        if database is not None and not bucket["OCI_BUCKET"]:
            raise ValueError("DB_HOST is set, so OCI_BUCKET, OCI_NAMESPACE and OCI_REGION must be set too")
        key_id = (values.get("RAZORPAY_KEY_ID") or "").strip()
        key_secret = (values.get("RAZORPAY_KEY_SECRET") or "").strip()
        if bool(key_id) != bool(key_secret):
            raise ValueError("Set both RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET, or neither")
        # A public, multi-user server must never hand out unmetered (unpaid) transcription.
        if database is not None and not key_id:
            raise ValueError("DB_HOST is set, so RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set too")
        redis_url = (values.get("REDIS_URL") or "").strip()
        # A public server keeps its limits in Redis, shared by every worker and restart.
        if database is not None and not redis_url:
            raise ValueError("DB_HOST is set, so REDIS_URL must be set too")
        per_hour = (values.get("UMLESS_TRANSCRIPTIONS_PER_HOUR") or "30").strip()
        if not per_hour.isdigit() or int(per_hour) < 1:
            raise ValueError(f"UMLESS_TRANSCRIPTIONS_PER_HOUR must be a whole number above 0, got {per_hour!r}")
        log_level = (values.get("UMLESS_LOG_LEVEL") or "INFO").strip().upper()
        if log_level not in LOG_LEVELS:
            raise ValueError(f"UMLESS_LOG_LEVEL must be one of {list(LOG_LEVELS)}, got {log_level!r}")
        return cls(
            deepgram_api_key=values.get("DEEPGRAM_API_KEY") or None,
            transcriber=transcriber,
            data_file=BACKEND_DIR / data_file if data_file else DEFAULT_DATA_FILE,
            database_url=database,
            clerk_issuer=clerk_issuer(publishable_key) if publishable_key else None,
            clerk_authorized_parties=parties,
            oci_namespace=bucket["OCI_NAMESPACE"] or None,
            oci_bucket=bucket["OCI_BUCKET"] or None,
            oci_region=bucket["OCI_REGION"] or None,
            razorpay_key_id=key_id or None,
            razorpay_key_secret=key_secret or None,
            razorpay_webhook_secret=(values.get("RAZORPAY_WEBHOOK_SECRET") or "").strip() or None,
            redis_url=redis_url or None,
            transcriptions_per_hour=int(per_hour),
            log_level=log_level,
        )


def database_url(values: dict[str, str | None]) -> URL | None:
    """The MySQL URL from DB_HOST, DB_PORT, DB_USER, DB_PASSWORD and DB_NAME; None without DB_HOST."""
    host = (values.get("DB_HOST") or "").strip()
    if not host:
        return None
    missing = [name for name in ("DB_USER", "DB_PASSWORD", "DB_NAME") if not values.get(name)]
    if missing:
        raise ValueError(f"DB_HOST is set, so {', '.join(missing)} must be set too")
    # URL.create escapes the password; an f-string URL breaks on "@", ":", "/" or "#".
    return URL.create(
        "mysql+pymysql",
        username=values["DB_USER"],
        password=values["DB_PASSWORD"],
        host=host,
        port=int(values.get("DB_PORT") or 3306),
        database=values["DB_NAME"],
        query={"charset": "utf8mb4"},
    )

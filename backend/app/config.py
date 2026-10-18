import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import dotenv_values

BACKEND_DIR = Path(__file__).resolve().parents[1]
# backend/.env wins over a repo-root .env; real environment variables win over both.
ENV_FILES = (BACKEND_DIR / ".env", BACKEND_DIR.parent / ".env")
TRANSCRIBERS = {"deepgram", "fake"}

# Winner of the Phase 0 spike (docs/spike/2026-10-18-deepgram-phase0.md).
DEEPGRAM_MODEL = "nova-3"
DEEPGRAM_PARAMS = {
    "filler_words": "true",
    "smart_format": "true",
    "language": "en",
}


@dataclass
class Settings:
    deepgram_api_key: str | None = field(default=None, repr=False)
    transcriber: str = "deepgram"
    deepgram_timeout_seconds: float = 60.0
    max_body_bytes: int = 25 * 1024 * 1024

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
        return cls(
            deepgram_api_key=values.get("DEEPGRAM_API_KEY") or None,
            transcriber=transcriber,
        )

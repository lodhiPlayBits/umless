import os
from pathlib import Path

import pytest

from app.transcription import DeepgramTranscriber

CLIP = Path(r"D:\umless\spike\clips\tts-raw.wav")


@pytest.mark.anyio
async def test_live_deepgram_transcribes_real_clip(request):
    if not request.config.getoption("--run-live"):
        pytest.skip("pass --run-live to call the real Deepgram API")
    api_key = os.environ.get("DEEPGRAM_API_KEY")
    if not api_key:
        pytest.skip("DEEPGRAM_API_KEY not set")
    if not CLIP.exists():
        pytest.skip(f"missing clip {CLIP}")

    result = await DeepgramTranscriber(api_key).transcribe(
        CLIP.read_bytes(), "audio/wav"
    )

    assert result.text.strip() != ""

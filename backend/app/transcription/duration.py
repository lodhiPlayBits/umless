"""How long a recording is, measured by the server before Deepgram is paid for it
(docs/roadmap/2026-11-01-metered-free-time.md).

Reads the container's packet timestamps with PyAV (FFmpeg) without decoding the sound, so it
works for Chrome's WebM, which has no duration in its header, as well as ogg, mp4, wav and mp3.
A few milliseconds per recording.
"""

import io

import av


class UnreadableAudio(Exception):
    """Not audio PyAV can read, or no audio in it."""


def audio_seconds(audio: bytes) -> float:
    """The length of the recording's first audio stream, in seconds."""
    try:
        with av.open(io.BytesIO(audio), mode="r") as container:
            if not container.streams.audio:
                raise UnreadableAudio("no audio stream")
            stream = container.streams.audio[0]
            start = end = None
            for packet in container.demux(stream):
                if packet.pts is None or packet.time_base is None:
                    continue
                begins = float(packet.pts * packet.time_base)
                ends = float((packet.pts + (packet.duration or 0)) * packet.time_base)
                start = begins if start is None else min(start, begins)
                end = ends if end is None else max(end, ends)
            header = container.duration / av.time_base if container.duration else None
    except UnreadableAudio:
        raise
    except (av.error.FFmpegError, ValueError, IndexError, OverflowError) as exc:
        raise UnreadableAudio(f"{type(exc).__name__}") from None
    seconds = (end - start) if start is not None and end is not None else header
    if not seconds or seconds <= 0:
        raise UnreadableAudio("no audio in it")
    return seconds

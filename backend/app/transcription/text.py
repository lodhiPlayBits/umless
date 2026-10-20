"""The transcript text: words joined, with one dot per full second of pause."""

from __future__ import annotations

import math
from typing import TYPE_CHECKING

# Type-only: models.py imports this module at runtime, so a real import back would be circular.
if TYPE_CHECKING:
    from app.transcription.models import Word


def pause_dots(gap: float) -> int:
    """Dots for the silence between two words: one per full second, none under 1 s.

    A 1 ms tolerance keeps float noise (e.g. 2.0000001 -> 3.0) from dropping a dot at exact
    second boundaries. The summary's pause counts use this same rule.
    """
    return max(0, math.floor(gap + 0.001))


def text_with_pauses(words: list[Word]) -> str:
    """Join the words, marking each pause of 1 s or more with one dot per full second.

    Silence before the first and after the last word is not marked.
    """
    parts: list[str] = []
    previous: Word | None = None
    for w in words:
        if previous is not None:
            dots = pause_dots(w.start - previous.end)
            if dots:
                parts.append("." * dots)
        parts.append(w.punctuated_word)
        previous = w
    return " ".join(parts)

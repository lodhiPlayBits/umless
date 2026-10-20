"""What a question is and the text rules every layer shares (docs/data-model.md)."""

from dataclasses import dataclass

MAX_TEXT_LENGTH = 500
# What JavaScript's String.prototype.trim() removes, so the server and the browser agree on
# "empty" and on the contract's `\S` pattern (Python's str.strip() uses a different set).
WHITESPACE = (
    "\t\n\v\f\r            "
    "      　﻿"
)


def trim(text: str) -> str:
    return text.strip(WHITESPACE)


@dataclass(frozen=True)
class Question:
    id: str
    text: str
    created_at: str

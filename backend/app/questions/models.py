from typing import Annotated, Any

from pydantic import AfterValidator, BaseModel, BeforeValidator, ConfigDict, Field
from pydantic_core import PydanticCustomError

from app.questions.repository import MAX_TEXT_LENGTH, trim


def _check_text(text: str) -> str:
    # The limit applies to the text as sent, before trimming (docs/data-model.md).
    if len(text) > MAX_TEXT_LENGTH:
        raise PydanticCustomError(
            "text_too_long",
            "Must be {max} characters or fewer ({length} now).",
            {"max": MAX_TEXT_LENGTH, "length": len(text)},
        )
    try:
        text.encode("utf-8")
    except UnicodeEncodeError:
        # A lone surrogate (valid JSON escape, not valid Unicode) would fail when saved.
        raise PydanticCustomError("text_invalid", "Must be valid Unicode text.") from None
    trimmed = trim(text)
    if not trimmed:
        raise PydanticCustomError(
            "text_blank", "Must contain at least one non-whitespace character."
        )
    return trimmed


def _integral_float_to_int(value: Any) -> Any:
    # OpenAPI 3.1 (JSON Schema 2020-12) counts 1.0 as an integer; strict mode would not.
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return value


QuestionText = Annotated[str, AfterValidator(_check_text)]


class QuestionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    text: QuestionText
    # Omitted means append; an explicit null is rejected, as in the contract.
    position: Annotated[
        int, BeforeValidator(_integral_float_to_int), Field(ge=0, le=100_000)
    ] = None  # type: ignore[assignment]


class QuestionUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    text: QuestionText

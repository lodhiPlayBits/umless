import pytest
from pydantic import ValidationError

from app.questions.models import QuestionCreate, QuestionUpdate

BLANK = "Must contain at least one non-whitespace character."
EMOJI = "\U0001f600"


def errors(model, data):
    with pytest.raises(ValidationError) as exc:
        model.model_validate(data)
    return exc.value.errors()


def fields_of(model, data):
    return [e["loc"][0] for e in errors(model, data)]


@pytest.fixture(params=[QuestionCreate, QuestionUpdate])
def model(request):
    return request.param


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("  hi  ", "hi"),
        ("　hi　", "hi"),
        ("﻿hi", "hi"),
        (" hi", "hi"),
        ("\n\thi\r\n", "hi"),
        ("\x1chi", "\x1chi"),
        (" a  b ", "a  b"),
    ],
)
def test_text_is_trimmed_with_javascript_whitespace_set(model, raw, expected):
    assert model.model_validate({"text": raw}).text == expected


@pytest.mark.parametrize("raw", ["", "   ", "　", "﻿", " \n\t"])
def test_blank_text_is_rejected_with_message(model, raw):
    errs = errors(model, {"text": raw})

    assert [e["loc"] for e in errs] == [("text",)]
    assert BLANK in errs[0]["msg"]


def test_raw_text_over_500_is_rejected_before_trimming(model):
    errs = errors(model, {"text": " " + "a" * 499 + " "})

    assert errs[0]["loc"] == ("text",)
    assert errs[0]["msg"].endswith("Must be 500 characters or fewer (501 now).")


def test_too_long_message_reports_raw_length(model):
    errs = errors(model, {"text": "a" * 750})

    assert errs[0]["msg"].endswith("Must be 500 characters or fewer (750 now).")


def test_500_emoji_accepted_and_501_rejected(model):
    assert model.model_validate({"text": EMOJI * 500}).text == EMOJI * 500
    assert "(501 now)" in errors(model, {"text": EMOJI * 501})[0]["msg"]


def test_exactly_500_characters_accepted(model):
    assert len(model.model_validate({"text": "a" * 500}).text) == 500


def test_lone_surrogate_is_rejected(model):
    assert fields_of(model, {"text": "a\ud800"}) == ["text"]


@pytest.mark.parametrize("bad", [5, None, ["a"], True])
def test_non_string_text_is_rejected(model, bad):
    assert fields_of(model, {"text": bad}) == ["text"]


def test_missing_text_is_rejected(model):
    assert fields_of(model, {}) == ["text"]


def test_unknown_keys_are_rejected(model):
    assert "extra" in fields_of(model, {"text": "hi", "extra": 1})


def test_position_defaults_to_none():
    assert QuestionCreate.model_validate({"text": "hi"}).position is None


@pytest.mark.parametrize(("raw", "expected"), [(0, 0), (100000, 100000), (1.0, 1), (1e2, 100)])
def test_position_accepts_integral_numbers(raw, expected):
    pos = QuestionCreate.model_validate({"text": "hi", "position": raw}).position

    assert pos == expected
    assert isinstance(pos, int) and not isinstance(pos, bool)


@pytest.mark.parametrize("bad", [1.5, -1, 100001, True, "1", None])
def test_position_rejects_invalid_values(bad):
    assert fields_of(QuestionCreate, {"text": "hi", "position": bad}) == ["position"]


def test_update_has_no_position():
    assert "position" in fields_of(QuestionUpdate, {"text": "hi", "position": 1})

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

# Kept in step with ContactMessage in docs/api/openapi.yaml.
# No \s/\S: Python, Rust (pydantic) and ECMAScript regex disagree on what counts as space.
# One line, no control characters (C0 or C1), at least one visible character: the name goes in the subject.
ONE_LINE = r"^[^\x00-\x1f\x7f-\x9f]*[^\x00-\x20\x7f-\x9f][^\x00-\x1f\x7f-\x9f]*$"
EMAIL = r"^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$"


class ContactMessage(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    kind: Literal["complaint", "suggestion", "other"]
    name: str = Field(min_length=1, max_length=100, pattern=ONE_LINE)
    email: str = Field(max_length=254, pattern=EMAIL)
    message: str = Field(min_length=10, max_length=5000)

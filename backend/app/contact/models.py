from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

# Kept in step with ContactMessage in docs/api/openapi.yaml.
ONE_LINE = r"^[^\x00-\x1f\x7f]*\S[^\x00-\x1f\x7f]*$"  # no newlines: the name goes in the subject
EMAIL = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"


class ContactMessage(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    kind: Literal["complaint", "suggestion", "other"]
    name: str = Field(min_length=1, max_length=100, pattern=ONE_LINE)
    email: str = Field(max_length=254, pattern=EMAIL)
    message: str = Field(min_length=10, max_length=5000)

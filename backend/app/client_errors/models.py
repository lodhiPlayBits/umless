from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

# Kept in step with ClientErrorReport in docs/api/openapi.yaml.


class ClientErrorReport(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    kind: Literal["render", "uncaught", "rejection", "csp"]
    message: str = Field(min_length=1, max_length=1000)
    path: str = Field(max_length=500, pattern=r"^/")
    stack: str = Field(default="", max_length=10000)
    component_stack: str = Field(default="", max_length=10000)

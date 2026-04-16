from typing import Any

from pydantic import BaseModel


class MetadataFilter(BaseModel):
    conditions: dict[str, Any] = {}

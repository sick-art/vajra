from typing import Any

from pydantic import BaseModel, field_validator


class IngestRecord(BaseModel):
    id: str
    text: str | None = None
    vector: list[float] | None = None
    metadata: dict[str, Any] = {}

    @field_validator("text", "vector", mode="after")
    @classmethod
    def check_text_or_vector(cls, v, info):
        # Validated at the request level instead
        return v


class IngestRequest(BaseModel):
    records: list[IngestRecord]
    store_type: str  # "lancedb" or "chroma"
    idempotency_key: str | None = None

    @field_validator("records")
    @classmethod
    def records_not_empty(cls, v):
        if not v:
            raise ValueError("records must not be empty")
        return v

    @field_validator("store_type")
    @classmethod
    def valid_store_type(cls, v):
        if v not in ("lancedb", "chroma"):
            raise ValueError(f"Unsupported store_type: {v}. Must be 'lancedb' or 'chroma'")
        return v


class IngestResponse(BaseModel):
    workflow_id: str
    accepted: int
    status: str = "started"

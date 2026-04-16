from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, field_validator


class CollectionCreate(BaseModel):
    name: str
    store_type: str  # "lancedb" | "chroma"
    store_name: str  # physical collection/table name in the store
    dimensions: int = 384
    metadata_schema: dict[str, Any] = {}
    # Initial contract fields
    required_metadata: list[str] = []
    optional_metadata: list[str] = []
    forbidden_metadata: list[str] = []
    embedding_model: str | None = None

    @field_validator("store_type")
    @classmethod
    def valid_store_type(cls, v):
        if v not in ("lancedb", "chroma"):
            raise ValueError(f"Unsupported store_type: {v}")
        return v


class CollectionInfo(BaseModel):
    id: UUID
    name: str
    store_type: str
    store_name: str
    dimensions: int
    metadata_schema: dict[str, Any]
    created_at: datetime | None = None
    updated_at: datetime | None = None
    vector_count: int = 0


class CollectionListResponse(BaseModel):
    collections: list[CollectionInfo]
    total: int

from typing import Any

from pydantic import BaseModel


class QueryRequest(BaseModel):
    query_text: str | None = None
    vector: list[float] | None = None
    top_k: int = 10
    filter: dict[str, Any] | None = None
    store_types: list[str] | None = None  # None = query all stores
    search_type: str = "dense"  # "dense" | "hybrid"

    model_config = {"extra": "forbid"}


class ScoredResult(BaseModel):
    id: str
    score: float
    metadata: dict[str, Any] = {}
    text: str | None = None
    store_type: str = ""


class QueryResponse(BaseModel):
    results: list[ScoredResult]
    total: int
    stores_queried: list[str]
    latency_ms: float

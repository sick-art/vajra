from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel


# --- Dataset schemas ---

class EvalQueryCreate(BaseModel):
    query_text: str
    relevant_ids: list[str]
    relevance_scores: list[float] = []


class DatasetCreate(BaseModel):
    name: str
    description: str | None = None
    collection: str
    queries: list[EvalQueryCreate]

    class Config:
        # Use model_config for Pydantic v2
        json_schema_extra = {
            "example": {
                "name": "my-eval-dataset",
                "collection": "my-collection",
                "queries": [
                    {
                        "query_text": "what is machine learning",
                        "relevant_ids": ["doc-1", "doc-3"],
                        "relevance_scores": [1.0, 0.8],
                    }
                ],
            }
        }


class EvalQueryOut(BaseModel):
    id: UUID
    dataset_id: UUID
    query_text: str
    relevant_ids: list[str]
    relevance_scores: list[float]
    metadata: dict[str, Any] = {}


class DatasetOut(BaseModel):
    id: UUID
    name: str
    description: str | None = None
    collection: str
    query_count: int
    created_at: datetime | None = None


class DatasetDetailOut(DatasetOut):
    queries: list[EvalQueryOut] = []


# --- Run schemas ---

class RunCreate(BaseModel):
    dataset_id: UUID
    name: str
    store_type: str | None = None
    embedding_model: str | None = None
    top_k: int = 10
    search_type: str = "dense"


class RunMetricsOut(BaseModel):
    avg_ndcg: float
    avg_recall_at_k: float
    avg_precision_at_k: float
    median_ndcg: float | None = None
    median_recall_at_k: float | None = None
    median_precision_at_k: float | None = None
    p95_latency_ms: float | None = None
    total_queries: int


class RunOut(BaseModel):
    id: UUID
    dataset_id: UUID
    name: str
    store_type: str | None = None
    embedding_model: str | None = None
    top_k: int
    search_type: str
    status: str
    workflow_id: str | None = None
    created_at: datetime | None = None
    completed_at: datetime | None = None


class RunDetailOut(RunOut):
    metrics: RunMetricsOut | None = None


class ResultOut(BaseModel):
    id: UUID
    run_id: UUID
    query_id: UUID
    query_text: str = ""
    returned_ids: list[str]
    returned_scores: list[float]
    ndcg: float | None = None
    recall_at_k: float | None = None
    precision_at_k: float | None = None
    latency_ms: float | None = None
    metadata: dict[str, Any] = {}

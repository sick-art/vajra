from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass
class VectorRecord:
    id: str
    vector: list[float]
    metadata: dict[str, Any] = field(default_factory=dict)
    text: str | None = None


@dataclass
class QueryResult:
    id: str
    score: float
    metadata: dict[str, Any] = field(default_factory=dict)
    text: str | None = None


class VectorStoreAdapter(ABC):
    """Abstract interface that all vector store adapters implement."""

    @abstractmethod
    async def upsert(self, collection: str, records: list[VectorRecord]) -> int:
        """Upsert records into the collection. Returns count written."""
        ...

    @abstractmethod
    async def query(
        self,
        collection: str,
        vector: list[float],
        top_k: int = 10,
        filter: dict[str, Any] | None = None,
    ) -> list[QueryResult]:
        """Dense vector similarity search."""
        ...

    @abstractmethod
    async def hybrid_query(
        self,
        collection: str,
        vector: list[float],
        query_text: str,
        top_k: int = 10,
        filter: dict[str, Any] | None = None,
    ) -> list[QueryResult]:
        """Hybrid sparse+dense search."""
        ...

    @abstractmethod
    async def delete(self, collection: str, ids: list[str]) -> int:
        """Delete records by ID. Returns count deleted."""
        ...

    @abstractmethod
    async def list_collections(self) -> list[str]:
        """List all collection/table names in the store."""
        ...

    @abstractmethod
    async def health(self) -> dict[str, Any]:
        """Return health status."""
        ...

    @abstractmethod
    async def get_collection_stats(self, collection: str) -> dict[str, Any]:
        """Return stats like count and dimensions for a collection."""
        ...

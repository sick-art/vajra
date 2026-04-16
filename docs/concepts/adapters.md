# Vector Store Adapters

VAJRA uses a pluggable adapter pattern to support multiple vector database backends through a common interface. Adding a new store requires only implementing the `VectorStoreAdapter` ABC.

---

## The `VectorStoreAdapter` Interface

**File:** `src/vectorhouse/adapters/base.py`

```python
from abc import ABC, abstractmethod
from dataclasses import dataclass

@dataclass
class VectorRecord:
    id: str
    vector: list[float]
    metadata: dict
    text: str | None = None

@dataclass
class QueryResult:
    id: str
    score: float
    metadata: dict
    text: str | None = None

class VectorStoreAdapter(ABC):

    @abstractmethod
    async def upsert(self, collection: str, records: list[VectorRecord]) -> int:
        """Insert or update records. Returns count written."""

    @abstractmethod
    async def query(
        self,
        collection: str,
        vector: list[float],
        top_k: int,
        filter: dict | None = None
    ) -> list[QueryResult]:
        """ANN search. Returns top_k results sorted by similarity."""

    @abstractmethod
    async def hybrid_query(
        self,
        collection: str,
        vector: list[float],
        query_text: str,
        top_k: int,
        filter: dict | None = None
    ) -> list[QueryResult]:
        """Combined vector + full-text search."""

    @abstractmethod
    async def delete(self, collection: str, ids: list[str]) -> int:
        """Delete records by ID. Returns count deleted."""

    @abstractmethod
    async def list_collections(self) -> list[str]:
        """Return all collection names in this store."""

    @abstractmethod
    async def health(self) -> dict:
        """Return health status dict."""

    @abstractmethod
    async def get_collection_stats(self, collection: str) -> dict:
        """Return stats: record count, dimensions, index size, etc."""
```

---

## Built-in Adapters

### `LanceDBAdapter`

**File:** `src/vectorhouse/adapters/lancedb_adapter.py`

| Property | Value |
|----------|-------|
| Backend | LanceDB |
| Storage | Local file system |
| License | Apache 2.0 |
| Config | `VH_LANCEDB_PATH` (default: `./data/lancedb`) |

LanceDB is the default, embedded vector store — no external server required. It supports both dense ANN and hybrid (vector + FTS) search natively via Apache Arrow/Lance format.

**Best for:** Development, single-node deployments, local embeddings.

---

### `ChromaAdapter`

**File:** `src/vectorhouse/adapters/chroma_adapter.py`

| Property | Value |
|----------|-------|
| Backend | Chroma |
| Storage | External HTTP server |
| Config | `VH_CHROMA_HOST`, `VH_CHROMA_PORT` |

ChromaAdapter is an HTTP client for a running Chroma server. Suitable for shared team deployments.

**Best for:** Team development, existing Chroma deployments.

---

## Writing a Custom Adapter

To add a new vector store (e.g., Qdrant, Pinecone, pgvector):

1. Create `src/vectorhouse/adapters/qdrant_adapter.py`
2. Implement all abstract methods of `VectorStoreAdapter`
3. Register the adapter in `AdapterRegistry` at startup:

```python
# In main.py lifespan():
from vectorhouse.adapters.qdrant_adapter import QdrantAdapter

registry.register("qdrant", QdrantAdapter(url="http://qdrant:6333"))
```

4. Collections with `store_type: "qdrant"` will now route to your adapter.

### Minimal example

```python
from vectorhouse.adapters.base import VectorStoreAdapter, VectorRecord, QueryResult

class QdrantAdapter(VectorStoreAdapter):

    def __init__(self, url: str):
        self.client = QdrantClient(url=url)

    async def upsert(self, collection: str, records: list[VectorRecord]) -> int:
        points = [
            PointStruct(id=r.id, vector=r.vector, payload=r.metadata)
            for r in records
        ]
        self.client.upsert(collection_name=collection, points=points)
        return len(records)

    async def query(self, collection, vector, top_k, filter=None) -> list[QueryResult]:
        results = self.client.search(
            collection_name=collection,
            query_vector=vector,
            limit=top_k
        )
        return [
            QueryResult(id=str(r.id), score=r.score, metadata=r.payload)
            for r in results
        ]

    # ... implement remaining methods
```

---

## `AdapterRegistry`

**File:** `src/vectorhouse/adapters/registry.py`

The registry maps `store_type` strings to adapter instances:

```python
class AdapterRegistry:
    def register(self, store_type: str, adapter: VectorStoreAdapter) -> None: ...
    def get(self, store_type: str) -> VectorStoreAdapter: ...
    def all(self) -> dict[str, VectorStoreAdapter]: ...
```

The `FederationService` queries the registry to resolve which adapters to include in a federated query.

---

## Planned Future Adapters

| Store | `store_type` | Notes |
|-------|-------------|-------|
| Qdrant | `qdrant` | gRPC-native client |
| Pinecone | `pinecone` | SaaS, HTTP API |
| pgvector | `pgvector` | PostgreSQL extension |
| Weaviate | `weaviate` | GraphQL API |
| Milvus | `milvus` | High-scale deployments |
| Redis Vector | `redis` | In-memory |

Each requires only implementing the `VectorStoreAdapter` interface — no changes to the core pipeline.

# Components

Detailed description of every module in the VAJRA codebase.

---

## API Layer (`src/vectorhouse/api/v1/`)

The REST API is built with FastAPI and served by Uvicorn. All endpoints are versioned under `/v1/`.

| Module | Endpoints | Responsibility |
|--------|-----------|----------------|
| `health.py` | `GET /v1/health` | Liveness probe |
| `collections.py` | `POST/GET/DELETE /v1/collections` | Collection CRUD |
| `ingest.py` | `POST /v1/ingest/{collection}` | Trigger ingest workflows |
| `query.py` | `POST /v1/query/{collection}`, `POST /v1/query` | Single-collection and federated search |
| `workflows.py` | `GET/POST /v1/workflows/…` | Temporal workflow introspection and control |
| `eval.py` | `POST/GET /v1/eval/…` | Evaluation dataset and run management |

---

## Services Layer (`src/vectorhouse/services/`)

Business logic lives in the services layer, which is injected into API handlers via `app.state`.

### `EmbeddingService`
Loads and caches embedding models from Hugging Face. Exposes `encode_single(text)` and `encode_batch(texts)` returning `list[float]` vectors.

- **Default model:** `sentence-transformers/all-MiniLM-L6-v2`
- **Dimensions:** 384 (configurable via `VH_EMBEDDING_DIMENSIONS`)
- **Caching:** Model loaded once at startup and held in memory

### `QueryService`
Coordinates query execution end-to-end:
1. Generates embedding if only text provided
2. Delegates to `FederationService`
3. Fires async audit log

### `FederationService`
Handles multi-store query coordination:
- Resolves applicable adapters from the registry
- Dispatches queries in parallel using `asyncio.gather`
- Normalizes scores: `score = 1.0 / (1.0 + L2_distance)`
- Merges multi-store results using **Reciprocal Rank Fusion (RRF, k=60)**
- Applies metadata filter post-merge

### `AuditService`
Writes append-only `AuditLog` records to PostgreSQL. Designed for async, off-critical-path invocation.

### `EvalService`
Manages evaluation lifecycle: dataset creation, run execution, metric computation, and result storage.

### `ChunkingService`
Splits text into chunks for ingestion. Strategies:
- `fixed` — fixed character/token count
- `sentence` — split on sentence boundaries
- `paragraph` — split on paragraph breaks
- `recursive` — hierarchical splitting

### `MetricsService`
Computes information retrieval metrics:
- **NDCG** — Normalized Discounted Cumulative Gain
- **Recall@K** — fraction of relevant documents appearing in top-K results
- **Precision@K** — fraction of top-K results that are relevant

---

## Adapter Layer (`src/vectorhouse/adapters/`)

All vector stores are accessed through the `VectorStoreAdapter` abstract base class.

### `VectorStoreAdapter` (ABC)

All adapters must implement these 7 async methods. This interface is the only contract between VAJRA's ingest/query layers and any backend store — adding a new store means implementing this class and registering it.

```python
class VectorStoreAdapter(ABC):
    async def upsert(collection: str, records: list[VectorRecord]) -> int
    async def query(collection: str, vector: list[float], top_k: int, filter: dict | None) -> list[QueryResult]
    async def hybrid_query(collection: str, vector: list[float], query_text: str, top_k: int, filter: dict | None) -> list[QueryResult]
    async def delete(collection: str, ids: list[str]) -> int
    async def list_collections() -> list[str]
    async def health() -> dict
    async def get_collection_stats(collection: str) -> dict
```

### `LanceDBAdapter`
Local, file-based vector database (Apache 2.0). No external server required. Data stored at `VH_LANCEDB_PATH` (default: `./data/lancedb`).

### `ChromaAdapter`
HTTP client for a Chroma server. Configured via `VH_CHROMA_HOST` and `VH_CHROMA_PORT`.

### `AdapterRegistry`
Maps `store_type` strings to adapter instances. New backends are registered here.

```python
registry = AdapterRegistry()
registry.register("lancedb", LanceDBAdapter(path))
registry.register("chroma", ChromaAdapter(host, port))
```

---

## Workflow Layer (`src/vectorhouse/workflows/`)

Temporal workflows orchestrate multi-step, fault-tolerant asynchronous operations.

### `IngestSingleWorkflow`
Processes one record through the full ingest pipeline:
1. `validate_contract()` — fail → dead-letter
2. `generate_embedding()` — if text, no vector
3. `dedup_check()` — skip if duplicate
4. `write_to_store()` — upsert with retry (max 3, exponential backoff)
5. `audit_log()` — immutable record

### `IngestBatchWorkflow`
Fan-out pattern: spawns child `IngestSingleWorkflow` for each record, gathers results, writes a single batch audit entry.

---

## Activity Layer (`src/vectorhouse/activities/`)

Each activity is an atomic, retryable unit of work within a workflow.

| Activity | File | Responsibility |
|----------|------|----------------|
| `validate_contract` | `validate_contract.py` | Dimension check, metadata schema validation |
| `generate_embedding` | `generate_embeddings.py` | Text → vector via EmbeddingService |
| `dedup_check` | `dedup_check.py` | Cosine similarity check vs stored top-1 |
| `write_to_store` | `write_to_store.py` | Adapter upsert with retry |
| `audit_log` | `audit_log.py` | Append-only PostgreSQL write |

---

## Data Models

### ORM Models (`src/vectorhouse/models/`)

#### `Collection`
Physical mapping of a logical collection name to a vector store backend.

#### `DataContract`
Schema definition for a collection: dimensions, required/optional/forbidden metadata fields, embedding model.

#### `AuditLog`
Immutable operation record. Never updated, only inserted. Fields: `operation`, `collection`, `principal`, `status`, `latency_ms`, `record_count`.

#### Evaluation Models
`EvalDataset` → `EvalQuery` (1:N), `EvalDataset` → `EvalRun` (1:N), `EvalRun` → `EvalResult` (1:N), `EvalRun` → `EvalRunMetrics` (1:1).

### Pydantic Schemas (`src/vectorhouse/schemas/`)

Request/response validation models for all API endpoints. Key types:

- `IngestRecord` — `{ id, text?, vector?, metadata }`
- `QueryRequest` — `{ query_text?, vector?, top_k, filter?, store_types?, search_type }`
- `ScoredResult` — `{ id, score, metadata, text?, store_type }`
- `CollectionCreate` / `CollectionInfo`
- `WorkflowSummary` / `WorkflowDetail`
- `DatasetCreate` / `RunCreate` / `RunDetailOut`

---

## Configuration (`src/vectorhouse/config.py`)

Settings are loaded from environment variables with the `VH_` prefix using Pydantic Settings. See the [Configuration Reference](../configuration.md) for the full list.

---

## Application Startup (`src/vectorhouse/main.py`)

The `lifespan()` async context manager initializes all services on startup:

1. Create async DB engine (PostgreSQL)
2. Load embedding model
3. Initialize adapter registry (LanceDB, Chroma)
4. Connect to Temporal server
5. Wire up services: `FederationService`, `AuditService`, `QueryService`, `EvalService`
6. Store all on `app.state` for request handlers

On shutdown: gracefully close Temporal client and dispose DB engine.

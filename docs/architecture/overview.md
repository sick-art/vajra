# System Architecture Overview

VAJRA is designed as a **control plane and governance layer** that sits between AI applications and vector databases. It does not replace the vector store — it governs it.

---

## Architecture Diagram

![VAJRA System Architecture](../diagrams/system-architecture.excalidraw)

---

## Design Philosophy

### Proxy, Not Wrapper
VAJRA is deployed as a gateway or sidecar proxy. Application SDKs are unchanged — they simply point to VAJRA's endpoint instead of the store directly.

### Control Plane / Data Plane Split
Policies, contracts, and metadata live in the **control plane** (PostgreSQL). Query execution happens in a **stateless data plane** that can be scaled independently.

### Zero-Trust by Default
All requests require an authenticated principal. No anonymous access. Every operation is logged.

### Async Audit Pipeline
Audit log writes are decoupled from the query path — queries return to the caller before the audit record is persisted, adding zero latency overhead.

---

## Request Flows

### Write Path (Ingest)

1. Client sends `POST /v1/ingest/{collection}` with records
2. API Gateway validates the collection exists, authenticates principal
3. Gateway starts a **Temporal workflow** (`IngestSingleWorkflow` or `IngestBatchWorkflow`)
4. Returns `202 Accepted` with `workflow_id` immediately
5. Temporal Worker executes the pipeline asynchronously:
    - **Activity 1:** `validate_contract()` — check dimensions and metadata schema
    - **Activity 2:** `generate_embedding()` — if text provided without vector
    - **Activity 3:** `dedup_check()` — cosine similarity vs stored vectors
    - **Activity 4:** `write_to_store()` — upsert via store adapter
    - **Activity 5:** `audit_log()` — append-only record to PostgreSQL

### Read Path (Query)

1. Client sends `POST /v1/query/{collection}` with query text or vector
2. `QueryService.execute()` is called
3. If only text provided, `EmbeddingService.encode_single()` generates a vector
4. `FederationService.federated_query()` dispatches parallel queries to all relevant adapters via `asyncio.gather`
5. Results are normalized (L2 distance → cosine similarity)
6. If multiple stores queried: **Reciprocal Rank Fusion (RRF, k=60)** merges results
7. Optional metadata filter applied post-merge
8. Response returned; `audit_log()` fired asynchronously via `asyncio.create_task`

---

## Scalability

| Layer | Scaling Approach |
|-------|-----------------|
| API Gateway | Stateless; scale out via HPA or serverless |
| Query Router | Stateless; scale independently |
| Temporal Worker | Scale by adding worker processes |
| Audit Log | Async pipeline; Kafka-backed in production |
| Control Plane API | Horizontal scale behind load balancer |
| Cache Layer | Redis Cluster, sharded by collection |

---

## Deployment Components

The full stack is defined in [`docker-compose.yml`](../../docker-compose.yml):

| Service | Image | Purpose |
|---------|-------|---------|
| `postgres` | postgres:16-alpine | Control plane database |
| `temporal` | temporalio/auto-setup | Workflow engine |
| `temporal-ui` | temporalio/ui | Workflow monitoring dashboard |
| `chroma` | chromadb/chroma | Vector store (HTTP API) |
| `vectorhouse-migrate` | (project image) | One-shot Alembic schema migration |
| `vectorhouse-api` | (project image) | FastAPI server (port 8000) |
| `vectorhouse-worker` | (project image) | Temporal worker process |

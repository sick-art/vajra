# Ingest Pipeline

The VAJRA ingest pipeline governs every vector write. All data entering any connected vector store passes through contract validation, optional embedding generation, deduplication, and audit logging — orchestrated by Temporal for fault tolerance.

---

## Pipeline Diagram

![Ingest Pipeline](../diagrams/ingest-pipeline.excalidraw)

---

## Flow Summary

```
Client  →  API Gateway  →  202 Accepted (workflow_id)
                              ↓  (async in Temporal Worker)
                    Activity 1: validate_contract
                              ↓ PASS
                    Activity 2: generate_embedding  (if text)
                              ↓
                    Activity 3: dedup_check
                              ↓ NEW
                    Activity 4: write_to_store
                              ↓
                    Activity 5: audit_log
```

---

## API Endpoint

### `POST /v1/ingest/{collection}`

Triggers an ingest workflow for one or more records.

**Request body:**

```json
{
  "records": [
    {
      "id": "doc-001",
      "text": "Optional raw text (auto-embedded if no vector)",
      "vector": [0.1, 0.2, ...],
      "metadata": {
        "source": "confluence",
        "author": "alice"
      }
    }
  ]
}
```

!!! note
    Either `text` or `vector` must be provided per record (not both required). If only `text` is given, the embedding model generates the vector. If only `vector` is given, it is used directly.

**Response — 202 Accepted:**

```json
{
  "workflow_id": "ingest-my-docs-20240416-abc123",
  "accepted": 10,
  "status": "accepted"
}
```

---

## Activity Details

### Activity 1: `validate_contract()`

**File:** `src/vectorhouse/activities/validate_contract.py`

Validates the record against the active `DataContract` for the collection.

Checks performed:
- **Dimension check** — vector dimensions match contract's `dimensions` field
- **Required metadata** — all fields in `required_metadata` list are present
- **Forbidden metadata** — none of the `forbidden_metadata` fields are present
- **Optional metadata** — present fields match expected types

**On failure:** Record is routed to the dead-letter audit log with `status="rejected"` and a structured `error_message`. No data is written to the store.

---

### Activity 2: `generate_embedding()`

**File:** `src/vectorhouse/activities/generate_embeddings.py`

Only executed when the record has `text` but no `vector`.

- Calls `EmbeddingService.encode_single(text)` to produce `list[float]`
- Default model: `sentence-transformers/all-MiniLM-L6-v2` (384 dimensions)
- Model is loaded once at worker startup and cached in memory

---

### Activity 3: `dedup_check()`

**File:** `src/vectorhouse/activities/dedup_check.py`

Detects near-duplicate embeddings to prevent redundant writes.

1. Queries the adapter for the top-1 most similar vector using the record's vector
2. Computes cosine similarity between the query vector and the retrieved result
3. If similarity ≥ `VH_DEDUP_SIMILARITY_THRESHOLD` (default: `0.98`): record is skipped

**On duplicate:** Audit log written with `status="duplicate_skipped"`. The existing vector is not updated.

---

### Activity 4: `write_to_store()`

**File:** `src/vectorhouse/activities/write_to_store.py`

Upserts the `VectorRecord` to the target store via the adapter.

```python
record = VectorRecord(id=record.id, vector=vector, metadata=record.metadata, text=record.text)
count = await adapter.upsert(collection_name, [record])
```

**Retry policy:** Maximum 3 attempts, exponential backoff. Failures are surfaced as workflow errors after exhausting retries.

---

### Activity 5: `audit_log()`

**File:** `src/vectorhouse/activities/audit_log.py`

Writes an immutable `AuditLog` row to PostgreSQL.

Fields recorded:
- `operation` — `"ingest"`
- `collection` — collection name
- `store_type` — adapter type (`lancedb`, `chroma`, etc.)
- `record_count` — number of records written
- `principal` — caller identity
- `status` — `"success"`, `"rejected"`, `"duplicate_skipped"`, or `"error"`
- `error_message` — populated on failure
- `latency_ms` — end-to-end pipeline duration
- `created_at` — UTC timestamp

---

## Batch Ingestion

When multiple records are submitted, `IngestBatchWorkflow` handles them via fan-out:

1. A parent workflow starts one child `IngestSingleWorkflow` per record
2. All child workflows run concurrently
3. Parent gathers results, computes aggregate stats
4. A single batch audit entry is written with total accepted/rejected/duplicate counts

---

## Dead-Letter Handling

Records that fail validation or policy checks are **never silently dropped**. They are:

1. Logged to `audit_log` with `status="rejected"` and the structured rejection reason
2. (In production) Routed to a configurable dead-letter sink (S3 prefix, Kafka topic)

This ensures 100% traceability of every attempted ingest operation.

---

## Workflow Monitoring

Track ingest workflow status via the API:

```bash
# Get workflow status
curl http://localhost:8000/v1/workflows/{workflow_id}

# Or via Temporal UI
open http://localhost:8088
```

Or directly via the [Workflows API](../api/workflows.md).

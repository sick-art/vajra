# Ingest API

The ingest API triggers the VAJRA ingest pipeline for one or more records. Operations are always asynchronous — the API returns a workflow ID immediately and the pipeline executes in the background.

---

## `POST /v1/ingest/{collection}`

Ingest one or more records into the specified collection.

**Path parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `collection` | string | Target collection name |

**Request body:**

```json
{
  "records": [
    {
      "id": "doc-001",
      "text": "VectorHouse provides governance for vector databases.",
      "metadata": {
        "source": "documentation",
        "author": "alice",
        "created_at": "2024-04-01"
      }
    },
    {
      "id": "doc-002",
      "vector": [0.12, -0.34, 0.56, ...],
      "metadata": {
        "source": "pdf",
        "page": 12
      }
    }
  ]
}
```

**Record fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique record identifier |
| `text` | string | One of `text`/`vector` | Raw text — auto-embedded by the pipeline |
| `vector` | list[float] | One of `text`/`vector` | Pre-computed embedding vector |
| `metadata` | object | No | Key-value metadata attached to the record |

!!! tip
    You can provide `text` without `vector` and the pipeline generates the embedding via `generate_embedding()`. You can also provide `vector` directly to bypass embedding generation (useful when you manage embeddings externally).

**Response — 202 Accepted:**

```json
{
  "workflow_id": "ingest-docs-2024041610-xyz789",
  "accepted": 2,
  "status": "accepted"
}
```

---

## Monitoring Ingest Progress

Track the workflow using the returned `workflow_id`:

```bash
curl http://localhost:8000/v1/workflows/ingest-docs-2024041610-xyz789
```

Or view all workflows in the [Temporal UI](http://localhost:8088).

---

## Error Handling

Individual record failures do not fail the batch. Each record is processed independently:

| Outcome | `status` in audit log | Description |
|---------|----------------------|-------------|
| Written | `success` | Record successfully stored |
| Invalid | `rejected` | Contract validation failed |
| Duplicate | `duplicate_skipped` | Cosine similarity ≥ threshold |
| Write error | `error` | Store write failed after retries |

All outcomes are captured in the [Audit Log](../concepts/governance.md).

---

## Batch vs Single Ingestion

- **1 record** → `IngestSingleWorkflow`
- **Multiple records** → `IngestBatchWorkflow` (fan-out: one child workflow per record)

There is no batch size limit at the API level, but very large batches (> 1000 records) should be split by the client for practical workflow management.

---

## Example: Ingest with text

```python
import httpx

async with httpx.AsyncClient(base_url="http://localhost:8000") as client:
    resp = await client.post("/v1/ingest/my-docs", json={
        "records": [
            {
                "id": "ticket-001",
                "text": "Customer cannot log in to the portal after password reset.",
                "metadata": {"customer_id": "cust-123", "ticket_id": "TKT-456"}
            }
        ]
    })
    data = resp.json()
    print(data["workflow_id"])  # track the async workflow
```

# Query API

VAJRA exposes two query endpoints: single-collection search and federated cross-store search.

---

## `POST /v1/query/{collection}`

Query a specific named collection.

**Path parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `collection` | string | Target collection name |

**Request body:**

```json
{
  "query_text": "how do I reset my password?",
  "top_k": 10,
  "filter": { "category": "auth" },
  "search_type": "dense",
  "store_types": ["lancedb"]
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `query_text` | string | — | Raw text (auto-embedded) |
| `vector` | list[float] | — | Pre-computed query vector |
| `top_k` | integer | `10` | Number of results to return |
| `filter` | object | `null` | Metadata key-value filter (AND conditions) |
| `search_type` | `"dense"` \| `"hybrid"` | `"dense"` | Search mode |
| `store_types` | list[string] | all | Restrict to specific adapter types |

!!! note
    Exactly one of `query_text` or `vector` must be provided.

**Response — 200 OK:**

```json
{
  "results": [
    {
      "id": "doc-042",
      "score": 0.923,
      "metadata": {
        "customer_id": "cust-123",
        "category": "auth",
        "source": "kb"
      },
      "text": "To reset your password, click Forgot Password on the login page.",
      "store_type": "lancedb"
    }
  ],
  "total": 3,
  "stores_queried": ["lancedb"],
  "latency_ms": 14.2
}
```

**ScoredResult fields:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Document ID |
| `score` | float | Relevance score ∈ [0, 1] |
| `metadata` | object | Attached metadata |
| `text` | string \| null | Original text (if stored) |
| `store_type` | string | Source adapter type |

---

## `POST /v1/query`

**Federated query** — search across all registered stores simultaneously.

Same request/response format as `/v1/query/{collection}`. When `store_types` is omitted, all adapters are queried.

Results from multiple stores are merged using **Reciprocal Rank Fusion (RRF)**. See [Query Pipeline](../pipelines/query.md) for details.

---

## Search Types

### Dense Search

Standard ANN (Approximate Nearest Neighbor) search. Uses only the query vector.

```json
{ "query_text": "password reset", "search_type": "dense" }
```

### Hybrid Search

Combines vector similarity with full-text/BM25 search. Requires the adapter to support hybrid queries (LanceDB supports this natively).

```json
{ "query_text": "password reset", "search_type": "hybrid" }
```

---

## Metadata Filtering

Filters are flat key-value conditions applied post-merge:

```json
{
  "query_text": "login issue",
  "filter": {
    "category": "auth",
    "source": "confluence"
  }
}
```

All conditions are **AND** (must match all fields). The filter does not affect the vector search ranking — results are first retrieved by similarity, then filtered.

---

## Examples

### Python

```python
import httpx

async with httpx.AsyncClient(base_url="http://localhost:8000") as client:
    # Single collection search
    resp = await client.post("/v1/query/my-docs", json={
        "query_text": "vector database governance",
        "top_k": 5,
        "filter": {"source": "documentation"}
    })
    results = resp.json()["results"]
    for r in results:
        print(f"{r['id']}  score={r['score']:.3f}  text={r['text'][:80]}")
```

### cURL

```bash
# Dense search with filter
curl -X POST http://localhost:8000/v1/query/my-docs \
  -H "Content-Type: application/json" \
  -d '{
    "query_text": "audit logging compliance",
    "top_k": 5,
    "filter": {"category": "governance"}
  }'

# Federated search across all stores
curl -X POST http://localhost:8000/v1/query \
  -H "Content-Type: application/json" \
  -d '{
    "query_text": "embedding model provenance",
    "top_k": 10
  }'
```

---

## Performance

Queries return in < 20 ms end-to-end (including embedding generation) for collections with millions of vectors when using LanceDB locally. Network-bound store adapters add latency proportional to round-trip time.

The async audit log write does not contribute to response latency.

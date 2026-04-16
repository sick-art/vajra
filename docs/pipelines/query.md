# Query Pipeline

The VAJRA query pipeline handles vector similarity search across one or multiple backends. It supports dense and hybrid search, optional cross-store federation with RRF result merging, and metadata filtering — all with an async audit trail.

---

## Pipeline Diagram

![Query Pipeline](../diagrams/query-pipeline.excalidraw)

---

## Flow Summary

```
Client Request (query_text | vector, top_k, filter, store_types, search_type)
    ↓
QueryService.execute()
    ↓  (if no pre-computed vector)
EmbeddingService.encode_single(query_text)  →  vector
    ↓
FederationService.federated_query()
    ↓  asyncio.gather  (parallel)
LanceDB Adapter ──────┬──── Chroma Adapter ──── … other adapters
                      ↓
              Normalize Scores (1.0 / (1.0 + L2_dist))
                      ↓  (multiple stores)
              RRF Merge  (k=60, sort by Σ 1/(60+rank))
                      ↓  (if filter)
              Apply Metadata Filter  →  top_k slice
                      ↓
              QueryResponse { results, total, stores_queried, latency_ms }
              + asyncio.create_task(audit_log)
```

---

## API Endpoints

### `POST /v1/query/{collection}`

Query a single named collection.

**Request:**

```json
{
  "query_text": "what is vector database governance?",
  "top_k": 10,
  "filter": { "source": "confluence" },
  "search_type": "dense",
  "store_types": ["lancedb"]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `query_text` | `string` | One of `query_text` / `vector` | Raw text (auto-embedded) |
| `vector` | `list[float]` | One of `query_text` / `vector` | Pre-computed query vector |
| `top_k` | `int` | No (default: 10) | Number of results to return |
| `filter` | `dict` | No | Metadata filter conditions |
| `search_type` | `"dense"` \| `"hybrid"` | No (default: `"dense"`) | Search mode |
| `store_types` | `list[string]` | No (default: all) | Restrict to specific adapter types |

**Response:**

```json
{
  "results": [
    {
      "id": "doc-001",
      "score": 0.94,
      "metadata": { "source": "confluence", "author": "alice" },
      "text": "VectorHouse provides governance for vector databases.",
      "store_type": "lancedb"
    }
  ],
  "total": 1,
  "stores_queried": ["lancedb"],
  "latency_ms": 12.4
}
```

---

### `POST /v1/query`

**Federated query** — search across all registered stores simultaneously.

Same request/response format as above. When `store_types` is omitted, all adapters are queried and results are merged via RRF.

---

## Federation & Score Merging

### Score Normalization

Raw L2 distances from vector stores are normalized to a `[0, 1]` cosine-like score:

```
score = 1.0 / (1.0 + L2_distance)
```

This ensures scores from different stores are comparable.

### Reciprocal Rank Fusion (RRF)

When multiple stores are queried, results are merged using **Reciprocal Rank Fusion** (RRF):

```
rrf_score(d) = Σ   1.0 / (k + rank_of_d_in_store)
            store∈stores
```

Where `k = 60` (standard RRF constant that reduces sensitivity to high rank differences).

Steps:
1. Within each store, results are ranked by their normalized score
2. For each unique document ID, RRF scores from all stores are summed
3. Final list is sorted by RRF score descending
4. Top-k are returned

This approach handles scenarios where a document appears in multiple stores (scores combined) or only one store (still ranked fairly).

---

## Search Types

### Dense Search (`search_type: "dense"`)

Standard ANN (Approximate Nearest Neighbor) search using the query vector. Calls `adapter.query()`.

### Hybrid Search (`search_type: "hybrid"`)

Combines vector similarity with keyword/BM25 search. Calls `adapter.hybrid_query()` which passes both the vector and `query_text` to the backend.

!!! info
    Hybrid search availability depends on the adapter backend. LanceDB supports full-text + vector hybrid search natively.

---

## Metadata Filtering

Filters are applied **post-merge** on the merged result set. The filter is a flat dictionary of key-value conditions:

```json
{ "filter": { "source": "confluence", "category": "technical" } }
```

All conditions are evaluated as AND (must match all specified fields).

---

## Audit Logging

Query operations are audited **asynchronously** — using `asyncio.create_task()` — so the audit write does not add latency to the query response.

The `AuditLog` entry records:
- `operation`: `"query"`
- `collection`: collection name
- `record_count`: number of results returned
- `latency_ms`: total query latency including embedding
- `status`: `"success"` or `"error"`

---

## Performance Characteristics

| Metric | Target |
|--------|--------|
| Query latency overhead (p99) | < 5 ms added over direct store call |
| Embedding generation | ~2–5 ms (MiniLM-L6-v2, cached model) |
| Audit log overhead | 0 ms (fully async, off critical path) |
| Federation overhead | ~1–2 ms per additional store (parallel) |
| Semantic cache hit rate (production RAG) | ≥ 30% |

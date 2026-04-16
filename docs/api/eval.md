# Evaluation API

The evaluation API manages retrieval quality benchmarking: creating datasets with ground-truth relevance, running evaluations, and retrieving metric results.

---

## Datasets

### `POST /v1/eval/datasets`

Create an evaluation dataset with ground-truth queries.

**Request:**

```json
{
  "name": "support-rag-v1",
  "description": "Customer support RAG quality benchmark",
  "collection": "customer-support",
  "queries": [
    {
      "query_text": "how do I reset my password?",
      "relevant_ids": ["doc-042", "doc-107"],
      "relevance_scores": [1.0, 0.7],
      "metadata": { "category": "auth" }
    }
  ]
}
```

**Response — 201 Created:**

```json
{
  "id": "...",
  "name": "support-rag-v1",
  "collection": "customer-support",
  "query_count": 1,
  "created_at": "2024-04-16T10:00:00Z"
}
```

---

### `GET /v1/eval/datasets`

List all evaluation datasets.

---

### `GET /v1/eval/datasets/{dataset_id}`

Get a dataset with all its queries.

**Response includes:**

```json
{
  "id": "...",
  "name": "support-rag-v1",
  "query_count": 50,
  "queries": [
    {
      "id": "...",
      "query_text": "how do I reset my password?",
      "relevant_ids": ["doc-042", "doc-107"],
      "relevance_scores": [1.0, 0.7]
    }
  ]
}
```

---

### `DELETE /v1/eval/datasets/{dataset_id}`

Delete a dataset and all associated queries (CASCADE).

---

## Runs

### `POST /v1/eval/runs`

Create an evaluation run configuration.

**Request:**

```json
{
  "dataset_id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "lancedb-dense-k10",
  "store_type": "lancedb",
  "embedding_model": "sentence-transformers/all-MiniLM-L6-v2",
  "top_k": 10,
  "search_type": "dense"
}
```

**Response — 201 Created:**

```json
{
  "id": "...",
  "name": "lancedb-dense-k10",
  "status": "pending",
  "dataset_id": "...",
  "created_at": "..."
}
```

---

### `POST /v1/eval/runs/{run_id}/execute`

Execute the run — evaluates every query in the dataset and computes metrics.

**Response — 200 OK:**

```json
{
  "run_id": "...",
  "status": "completed",
  "message": "Execution complete. 50 queries evaluated."
}
```

---

### `GET /v1/eval/runs`

List evaluation runs. Filter by dataset:

```
GET /v1/eval/runs?dataset_id={dataset_id}
```

---

### `GET /v1/eval/runs/{run_id}`

Get a run with its aggregate metrics.

**Response:**

```json
{
  "id": "...",
  "name": "lancedb-dense-k10",
  "status": "completed",
  "store_type": "lancedb",
  "embedding_model": "sentence-transformers/all-MiniLM-L6-v2",
  "top_k": 10,
  "search_type": "dense",
  "metrics": {
    "avg_ndcg": 0.812,
    "avg_recall_at_k": 0.743,
    "avg_precision_at_k": 0.312,
    "median_ndcg": 0.834,
    "median_recall_at_k": 0.760,
    "median_precision_at_k": 0.300,
    "p95_latency_ms": 28.4,
    "total_queries": 50
  },
  "completed_at": "2024-04-16T10:05:00Z"
}
```

---

### `GET /v1/eval/runs/{run_id}/results`

Get per-query results for a run.

**Response:**

```json
{
  "results": [
    {
      "query_id": "...",
      "query_text": "how do I reset my password?",
      "returned_ids": ["doc-042", "doc-215", "doc-107"],
      "returned_scores": [0.923, 0.871, 0.845],
      "ndcg": 0.912,
      "recall_at_k": 1.0,
      "precision_at_k": 0.666,
      "latency_ms": 12.1
    }
  ]
}
```

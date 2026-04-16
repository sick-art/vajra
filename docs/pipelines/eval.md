# Evaluation Pipeline

The VAJRA evaluation pipeline enables rigorous, reproducible benchmarking of retrieval quality. You create datasets with ground-truth relevance judgments, run them against collections, and get back NDCG, Recall@K, and Precision@K metrics.

---

## Pipeline Diagram

![Evaluation Pipeline](../diagrams/eval-pipeline.excalidraw)

---

## Flow Summary

```
Step 1  →  Create Dataset  (queries + ground-truth relevance)
Step 2  →  Create Run  (configure store, model, top_k)
Step 3  →  Execute Run
           For each EvalQuery:
               QueryService.execute(query_text)  →  [ScoredResult]
               Compute: NDCG, Recall@K, Precision@K
               Store: EvalResult
           Aggregate: avg/median metrics + p95 latency
           Store: EvalRunMetrics
           Update: EvalRun.status = "completed"
```

---

## Step 1: Create a Dataset

**`POST /v1/eval/datasets`**

A dataset holds a collection of queries, each annotated with a list of relevant document IDs and their relevance scores.

**Request:**

```json
{
  "name": "rag-quality-v1",
  "description": "Customer support RAG evaluation set",
  "collection": "my-docs",
  "queries": [
    {
      "query_text": "how do I reset my password?",
      "relevant_ids": ["doc-042", "doc-107", "doc-215"],
      "relevance_scores": [1.0, 0.8, 0.6],
      "metadata": { "category": "auth" }
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Unique dataset name |
| `collection` | `string` | Collection this dataset targets |
| `queries[].query_text` | `string` | The query to run |
| `queries[].relevant_ids` | `list[string]` | Ground-truth relevant document IDs |
| `queries[].relevance_scores` | `list[float]` | Graded relevance (1.0 = most relevant) |

Stored as `EvalDataset` + `EvalQuery` rows in PostgreSQL.

---

## Step 2: Create a Run

**`POST /v1/eval/runs`**

A run configures how the evaluation will be executed against a dataset.

**Request:**

```json
{
  "dataset_id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "lancedb-minilm-topk10",
  "store_type": "lancedb",
  "embedding_model": "sentence-transformers/all-MiniLM-L6-v2",
  "top_k": 10,
  "search_type": "dense"
}
```

Response includes `run_id` and `status: "pending"`.

---

## Step 3: Execute the Run

**`POST /v1/eval/runs/{run_id}/execute`**

Triggers `EvalService.execute_run()` which iterates over every `EvalQuery` in the dataset:

1. Calls `QueryService.execute(query_text, top_k, store_type)` → `[ScoredResult]`
2. Extracts `returned_ids` from results
3. Computes per-query metrics against `relevant_ids` / `relevance_scores`
4. Writes `EvalResult` to PostgreSQL
5. After all queries: aggregates into `EvalRunMetrics`
6. Sets `EvalRun.status = "completed"`

---

## Metrics Explained

### NDCG — Normalized Discounted Cumulative Gain

Measures ranking quality by rewarding relevant documents appearing higher in the result list, weighted by their relevance score.

```
DCG@K  = Σ  relevance_score(i) / log2(i + 2)   for i in 0..K
IDCG@K = DCG of the ideal (perfect) ranking
NDCG@K = DCG@K / IDCG@K          ∈ [0, 1]
```

Higher is better. `1.0` = perfect ranking.

### Recall@K

What fraction of the relevant documents appear in the top-K results?

```
Recall@K = |relevant_ids ∩ returned_ids[0:K]| / |relevant_ids|
```

### Precision@K

What fraction of the top-K results are actually relevant?

```
Precision@K = |relevant_ids ∩ returned_ids[0:K]| / K
```

---

## Retrieving Results

### Get Run Metrics

```bash
GET /v1/eval/runs/{run_id}
```

**Response:**

```json
{
  "id": "...",
  "name": "lancedb-minilm-topk10",
  "status": "completed",
  "metrics": {
    "avg_ndcg": 0.812,
    "avg_recall_at_k": 0.743,
    "avg_precision_at_k": 0.312,
    "median_ndcg": 0.834,
    "p95_latency_ms": 28.4,
    "total_queries": 50
  }
}
```

### Get Per-Query Results

```bash
GET /v1/eval/runs/{run_id}/results
```

Returns one `EvalResult` per query with individual `ndcg`, `recall_at_k`, `precision_at_k`, `latency_ms` values.

---

## Comparing Runs

Run multiple configurations against the same dataset to compare:

```bash
# Run 1: LanceDB dense search
POST /v1/eval/runs  { store_type: "lancedb", search_type: "dense" }
POST /v1/eval/runs/{id}/execute

# Run 2: Chroma hybrid search
POST /v1/eval/runs  { store_type: "chroma", search_type: "hybrid" }
POST /v1/eval/runs/{id}/execute

# Compare
GET /v1/eval/runs?dataset_id={dataset_id}
```

---

## Data Model

See the [Data Model Diagram](../diagrams/data-model.excalidraw) for the full ER schema.

Key relationships:
- `EvalDataset` (1) → (N) `EvalQuery`
- `EvalDataset` (1) → (N) `EvalRun`
- `EvalRun` (1) → (N) `EvalResult`
- `EvalRun` (1) → (1) `EvalRunMetrics`
- `EvalResult.query_id` → `EvalQuery` (N:1)

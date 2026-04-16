# VAJRA — VectorHouse

**VAJRA** is a strategic, scalable, and modular **data virtualization and governance platform** for vector databases used in AI workloads. It provides a high-performance ingestion pipeline and a unified access layer that sits between AI applications and the underlying vector stores — enforcing data contracts, access policies, and retention rules while maintaining a complete, tamper-evident audit trail.

---

## The Problem

As organizations deploy AI systems backed by vector databases (RAG pipelines, semantic search, embedding stores), they face a set of compounding problems:

| Problem | Impact |
|---------|--------|
| **Fragmentation** | Multiple vector stores (Pinecone, Chroma, Qdrant, pgvector…) with no unified access layer |
| **No governance** | No standard way to enforce who can query which collections, or retain evidence of access |
| **Missing data contracts** | Embedding shape, lineage, and ownership undocumented and unchecked |
| **Compliance gaps** | GDPR, HIPAA, SOC 2 require access logs; vector stores provide none natively |
| **Storage sprawl** | Duplicate embeddings across teams, no deduplication or tiered storage policies |
| **Ungoverned ingestion** | Data lands without validation, provenance tracking, or policy checks |

---

## The Vision

> A single control plane that makes every vector database **auditable**, **policy-governed**, and **contract-enforced** — without requiring teams to change how they build AI applications.

---

## Core Capabilities

=== "Data Virtualization"
    - **Unified query API** — one endpoint for similarity search, hybrid search, and metadata filtering
    - **Multi-backend routing** — connect Chroma, LanceDB, Qdrant, Pinecone, pgvector via pluggable adapters
    - **Query federation** — cross-store fan-out search with RRF result merging and re-ranking
    - **Transparent caching** — semantic result caching to reduce backend load

=== "Governance & Audit"
    - **Full audit trail** — records principal, timestamp, collection, result count, latency, and policy decision
    - **Tamper-evident log storage** — append-only records in PostgreSQL
    - **Query attribution** — link queries back to application name, model ID, and session
    - **Alerting** — configurable rules for anomalous access patterns

=== "Data Contracts"
    - **Schema enforcement** — declare embedding dimensions, required/optional/forbidden metadata fields
    - **Model provenance tracking** — record which embedding model produced each vector
    - **Contract versioning** — breaking changes require explicit approval workflow
    - **Owner/steward assignment** — each contract names an owning team and data stewards

=== "Ingestion Pipeline"
    - **Unified ingest API** — accepts raw documents, pre-computed embeddings, or structured records
    - **Contract validation** — dimension check, required metadata, forbidden field rejection
    - **Embedding generation** — optional text → vector via configurable embedding model
    - **Deduplication** — near-duplicate detection (cosine similarity threshold)
    - **Dead-letter handling** — rejected records routed to sink with structured rejection reason

=== "Evaluation"
    - **Dataset management** — ground-truth relevance judgments for evaluation queries
    - **Batch evaluation** — execute runs across collections with configurable parameters
    - **IR metrics** — NDCG, Recall@K, Precision@K with aggregate and per-query results

---

## Quick Start

```bash
# Clone and start the full stack
git clone https://github.com/vectorhouse/vajra
cd vajra
docker compose up -d

# Wait for services to start, then create a collection
curl -X POST http://localhost:8000/v1/collections \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-docs",
    "store_type": "lancedb",
    "store_name": "my-docs",
    "dimensions": 384
  }'

# Ingest a document (text auto-embedded)
curl -X POST http://localhost:8000/v1/ingest/my-docs \
  -H "Content-Type: application/json" \
  -d '{
    "records": [{
      "id": "doc-001",
      "text": "VectorHouse provides governance for vector databases.",
      "metadata": { "source": "readme" }
    }]
  }'

# Query
curl -X POST http://localhost:8000/v1/query/my-docs \
  -H "Content-Type: application/json" \
  -d '{
    "query_text": "what is vector database governance?",
    "top_k": 5
  }'
```

---

## Stack

| Component | Technology |
|-----------|-----------|
| API Gateway | FastAPI + Uvicorn (async) |
| Workflow Orchestration | Temporal |
| Embedding Models | sentence-transformers (HuggingFace) |
| Vector Stores | LanceDB, Chroma (+ extensible adapters) |
| Control Plane DB | PostgreSQL 16 |
| ORM | SQLAlchemy 2.0 (async) |
| Migrations | Alembic |
| Container Runtime | Docker / Docker Compose |

---

## Navigation

- [**Architecture Overview**](architecture/overview.md) — System design and component interactions
- [**Ingest Pipeline**](pipelines/ingest.md) — How data flows from source to vector store
- [**Query Pipeline**](pipelines/query.md) — Federated search and score merging
- [**Evaluation Pipeline**](pipelines/eval.md) — Benchmarking retrieval quality
- [**API Reference**](api/collections.md) — Complete REST API documentation
- [**Data Contracts**](concepts/data-contracts.md) — Schema enforcement and provenance
- [**Configuration**](configuration.md) — Environment variables and settings
- [**Deployment Guide**](deployment.md) — Docker, Kubernetes, and production setup

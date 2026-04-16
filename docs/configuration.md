# Configuration Reference

All VAJRA settings are loaded from environment variables with the `VH_` prefix using Pydantic Settings. Settings can also be placed in a `.env` file in the project root.

---

## Application

| Variable | Default | Description |
|----------|---------|-------------|
| `VH_APP_HOST` | `0.0.0.0` | API server bind host |
| `VH_APP_PORT` | `8000` | API server port |

---

## PostgreSQL (Control Plane)

| Variable | Default | Description |
|----------|---------|-------------|
| `VH_POSTGRES_URL` | `postgresql+asyncpg://postgres:postgres@localhost:5432/vectorhouse` | Async connection URL (used by FastAPI) |
| `VH_POSTGRES_SYNC_URL` | `postgresql://postgres:postgres@localhost:5432/vectorhouse` | Sync connection URL (used by Temporal activities) |

!!! warning
    Both `VH_POSTGRES_URL` and `VH_POSTGRES_SYNC_URL` must point to the same database. The async driver (`asyncpg`) is used by the API; the sync driver is used inside Temporal activities where async is not available.

---

## Temporal

| Variable | Default | Description |
|----------|---------|-------------|
| `VH_TEMPORAL_HOST` | `localhost:7233` | Temporal server gRPC address |
| `VH_TEMPORAL_NAMESPACE` | `default` | Temporal namespace |
| `VH_TEMPORAL_TASK_QUEUE` | `vectorhouse-ingest` | Task queue name for ingest workflows |

---

## LanceDB

| Variable | Default | Description |
|----------|---------|-------------|
| `VH_LANCEDB_PATH` | `./data/lancedb` | Directory path for LanceDB data files |

---

## Chroma

| Variable | Default | Description |
|----------|---------|-------------|
| `VH_CHROMA_HOST` | `localhost` | Chroma server hostname |
| `VH_CHROMA_PORT` | `8001` | Chroma server port |

---

## Embedding Model

| Variable | Default | Description |
|----------|---------|-------------|
| `VH_EMBEDDING_MODEL_NAME` | `sentence-transformers/all-MiniLM-L6-v2` | HuggingFace model identifier |
| `VH_EMBEDDING_DIMENSIONS` | `384` | Output vector dimensionality |

The embedding model is downloaded from HuggingFace on first run and cached locally. The model must produce vectors of exactly `VH_EMBEDDING_DIMENSIONS` dimensions.

**Available models (examples):**

| Model | Dimensions | Notes |
|-------|-----------|-------|
| `all-MiniLM-L6-v2` | 384 | Default, fast, ~80 MB |
| `all-mpnet-base-v2` | 768 | Higher quality, ~420 MB |
| `text-embedding-3-small` | 1536 | OpenAI (requires API key) |
| `text-embedding-3-large` | 3072 | OpenAI (requires API key) |

---

## Deduplication

| Variable | Default | Description |
|----------|---------|-------------|
| `VH_DEDUP_SIMILARITY_THRESHOLD` | `0.98` | Cosine similarity threshold above which a record is considered a duplicate |

Set to `1.0` to disable deduplication entirely (only exact matches skipped). Set lower (e.g., `0.95`) for more aggressive deduplication.

---

## Example `.env` File

```dotenv
# Application
VH_APP_HOST=0.0.0.0
VH_APP_PORT=8000

# Database
VH_POSTGRES_URL=postgresql+asyncpg://vajra:secret@postgres:5432/vajra
VH_POSTGRES_SYNC_URL=postgresql://vajra:secret@postgres:5432/vajra

# Temporal
VH_TEMPORAL_HOST=temporal:7233
VH_TEMPORAL_NAMESPACE=default
VH_TEMPORAL_TASK_QUEUE=vectorhouse-ingest

# Vector Stores
VH_LANCEDB_PATH=/data/lancedb
VH_CHROMA_HOST=chroma
VH_CHROMA_PORT=8001

# Embedding
VH_EMBEDDING_MODEL_NAME=sentence-transformers/all-MiniLM-L6-v2
VH_EMBEDDING_DIMENSIONS=384

# Dedup
VH_DEDUP_SIMILARITY_THRESHOLD=0.98
```

---

## Source

Settings are defined in `src/vectorhouse/config.py` using `pydantic_settings.BaseSettings`. Refer to that file for the canonical list of all settings and their types.

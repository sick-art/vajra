# Deployment Architecture

VAJRA supports four deployment models, from local development to enterprise Kubernetes clusters.

---

## Deployment Models

| Model | Description | Target |
|-------|-------------|--------|
| **Local / Docker Compose** | Full stack in a single compose file | Development, testing |
| **Self-hosted (K8s)** | Run in your own Kubernetes cluster | Enterprise, regulated industries |
| **Embedded sidecar** | Deploy alongside each application pod | High-performance, low-latency |
| **Hybrid** | Control plane hosted; data plane self-hosted | Compliance-sensitive |

---

## Docker Compose Stack

The [`docker-compose.yml`](../../docker-compose.yml) brings up the complete VAJRA stack:

```
┌─────────────────────────────────────────────────────────────────┐
│                     Docker Compose Stack                        │
│                                                                  │
│  ┌─────────────┐   ┌───────────────┐   ┌────────────────────┐  │
│  │ postgres:16 │   │ temporal      │   │ temporal-ui        │  │
│  │ port: 5432  │   │ port: 7233    │   │ port: 8088         │  │
│  └─────────────┘   └───────────────┘   └────────────────────┘  │
│                                                                  │
│  ┌─────────────┐   ┌───────────────┐   ┌────────────────────┐  │
│  │ chroma      │   │ vectorhouse   │   │ vectorhouse        │  │
│  │ port: 8001  │   │ -api          │   │ -worker            │  │
│  └─────────────┘   │ port: 8000    │   │ (Temporal worker)  │  │
│                     └───────────────┘   └────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Starting the stack

```bash
docker compose up -d

# Check service health
curl http://localhost:8000/v1/health

# View Temporal workflow UI
open http://localhost:8088
```

### Stopping

```bash
docker compose down          # stop containers
docker compose down -v       # stop and remove volumes (resets all data)
```

---

## Service Dependencies

Services start in this dependency order. Both the API and worker require a healthy PostgreSQL instance, and Temporal must be available before they will accept traffic:

```
vectorhouse-api
  └── depends_on: postgres (healthy), temporal (started)

vectorhouse-worker
  └── depends_on: postgres (healthy), temporal (started)

vectorhouse-migrate
  └── depends_on: postgres (healthy)
  └── runs once: alembic upgrade head

temporal
  └── depends_on: postgres (healthy)
  └── stores workflow state in postgres
```

---

## Environment Variables

All VAJRA services are configured through environment variables (see [Configuration Reference](../configuration.md)).

Key variables to set for production:

```bash
# Database
VH_POSTGRES_URL=postgresql+asyncpg://user:pass@host:5432/vajra
VH_POSTGRES_SYNC_URL=postgresql://user:pass@host:5432/vajra

# Temporal
VH_TEMPORAL_HOST=temporal:7233
VH_TEMPORAL_NAMESPACE=default

# Vector Stores
VH_LANCEDB_PATH=/data/lancedb
VH_CHROMA_HOST=chroma
VH_CHROMA_PORT=8001

# Embedding Model
VH_EMBEDDING_MODEL_NAME=sentence-transformers/all-MiniLM-L6-v2
VH_EMBEDDING_DIMENSIONS=384

# Application
VH_APP_HOST=0.0.0.0
VH_APP_PORT=8000
```

---

## Kubernetes (Production)

For production Kubernetes deployments, deploy the following:

### Required Services

| Service | Type | Replicas |
|---------|------|----------|
| `vajra-api` | Deployment | 2+ |
| `vajra-worker` | Deployment | 2+ (scale for throughput) |
| `vajra-migrate` | Job (one-shot) | 1 |
| `postgres` | StatefulSet or managed RDS | 1 (primary + replica) |
| `temporal` | Helm chart | Cluster |
| `chroma` | Deployment | 1+ |

### Health Checks

```yaml
livenessProbe:
  httpGet:
    path: /v1/health
    port: 8000
  initialDelaySeconds: 10
  periodSeconds: 30

readinessProbe:
  httpGet:
    path: /v1/health
    port: 8000
  initialDelaySeconds: 5
  periodSeconds: 10
```

### Resource Recommendations

| Component | CPU Request | CPU Limit | Memory Request | Memory Limit |
|-----------|-------------|-----------|----------------|--------------|
| `vajra-api` | 250m | 1000m | 512Mi | 2Gi |
| `vajra-worker` | 500m | 2000m | 1Gi | 4Gi* |
| `postgres` | 500m | 2000m | 1Gi | 4Gi |

*Worker requires more memory due to embedding model loading (~500 MB for `all-MiniLM-L6-v2`).

---

## Database Migrations

VAJRA uses Alembic to manage schema migrations.

```bash
# Apply all pending migrations
alembic upgrade head

# Rollback one migration
alembic downgrade -1

# Show current revision
alembic current

# Generate a new migration
alembic revision --autogenerate -m "add_my_column"
```

The initial migration (`0001_initial.py`) creates all tables: `collections`, `data_contracts`, `audit_log`, `eval_datasets`, `eval_queries`, `eval_runs`, `eval_results`, `eval_run_metrics`.

---

## Building the Docker Image

```bash
# Build
docker build -t vajra:latest .

# The Dockerfile uses Python 3.12-slim with uv for fast dependency installation
# Build stages: install deps → copy source → run app
```

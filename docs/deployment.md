# Deployment Guide

VAJRA can be run locally with Docker Compose for development, or deployed to Kubernetes for production. This guide covers both paths, plus database migration management and image building.

---

## Prerequisites

- Docker and Docker Compose v2
- Python 3.12+ and [`uv`](https://github.com/astral-sh/uv) (for local development)
- 4 GB RAM minimum (embedding model + Temporal + PostgreSQL)

---

## Local Development

### 1. Start the stack

```bash
cd vectorhouse
docker compose up -d
```

This starts: PostgreSQL, Temporal, Temporal UI, Chroma, and runs the database migration.

### 2. Start the API and Worker

For development with hot reload, run the API and worker outside Docker:

```bash
# Install dependencies
uv sync

# Apply migrations
alembic upgrade head

# Start API (hot reload)
uv run uvicorn vectorhouse.main:app --reload --host 0.0.0.0 --port 8000

# In another terminal: start Temporal worker
uv run python -m vectorhouse.worker
```

### 3. Verify

```bash
curl http://localhost:8000/v1/health
# → {"status": "healthy"}

# Temporal UI
open http://localhost:8088
```

---

## Docker Compose (Full Stack)

Start everything including the API and worker:

```bash
docker compose up -d

# View logs
docker compose logs -f vectorhouse-api
docker compose logs -f vectorhouse-worker

# Restart a service
docker compose restart vectorhouse-api

# Stop and remove volumes (resets all data)
docker compose down -v
```

The API is exposed at `http://localhost:8000`.

---

## Production: Kubernetes

### Namespace and Config

```bash
kubectl create namespace vajra

# Create config secret
kubectl create secret generic vajra-config \
  --namespace vajra \
  --from-literal=VH_POSTGRES_URL="postgresql+asyncpg://user:pass@postgres:5432/vajra" \
  --from-literal=VH_POSTGRES_SYNC_URL="postgresql://user:pass@postgres:5432/vajra" \
  --from-literal=VH_TEMPORAL_HOST="temporal-frontend:7233"
```

### Deploy Services

**API Deployment:**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: vajra-api
  namespace: vajra
spec:
  replicas: 2
  selector:
    matchLabels:
      app: vajra-api
  template:
    metadata:
      labels:
        app: vajra-api
    spec:
      containers:
        - name: vajra-api
          image: vajra:latest
          command: ["uvicorn", "vectorhouse.main:app", "--host", "0.0.0.0", "--port", "8000"]
          ports:
            - containerPort: 8000
          envFrom:
            - secretRef:
                name: vajra-config
          resources:
            requests:
              cpu: 250m
              memory: 512Mi
            limits:
              cpu: 1000m
              memory: 2Gi
          livenessProbe:
            httpGet:
              path: /v1/health
              port: 8000
            initialDelaySeconds: 15
            periodSeconds: 30
          readinessProbe:
            httpGet:
              path: /v1/health
              port: 8000
            initialDelaySeconds: 5
            periodSeconds: 10
```

**Worker Deployment:**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: vajra-worker
  namespace: vajra
spec:
  replicas: 2
  selector:
    matchLabels:
      app: vajra-worker
  template:
    metadata:
      labels:
        app: vajra-worker
    spec:
      containers:
        - name: vajra-worker
          image: vajra:latest
          command: ["python", "-m", "vectorhouse.worker"]
          envFrom:
            - secretRef:
                name: vajra-config
          resources:
            requests:
              cpu: 500m
              memory: 1Gi
            limits:
              cpu: 2000m
              memory: 4Gi
```

### Migration Job

Run as a pre-deployment Job:

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: vajra-migrate
  namespace: vajra
spec:
  template:
    spec:
      containers:
        - name: migrate
          image: vajra:latest
          command: ["alembic", "upgrade", "head"]
          envFrom:
            - secretRef:
                name: vajra-config
      restartPolicy: OnFailure
```

---

## Building the Docker Image

```bash
# Build production image
docker build -t vajra:latest .

# Tag for registry
docker tag vajra:latest registry.example.com/vajra:1.0.0
docker push registry.example.com/vajra:1.0.0
```

The `Dockerfile` uses Python 3.12 slim with `uv` for fast, reproducible dependency installation.

---

## Database Migrations

```bash
# Apply all pending migrations
alembic upgrade head

# Show migration history
alembic history

# Show current revision
alembic current

# Rollback last migration
alembic downgrade -1
```

The migration state is stored in the `alembic_version` table in PostgreSQL.

---

## Health Checks

```bash
# API health (includes DB and adapter connectivity)
curl http://localhost:8000/v1/health
```

Monitor Temporal workflows at the Temporal UI (`:8088` in local, configure ingress for K8s).

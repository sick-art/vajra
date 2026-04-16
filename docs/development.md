# Development Guide

This guide covers local setup, running tests, linting, and how to extend VAJRA with new vector store adapters, Temporal activities, and IR metrics.

---

## Project Structure

```
src/vectorhouse/
├── main.py           # FastAPI app + lifespan (service wiring)
├── config.py         # Environment variable settings
├── worker.py         # Temporal worker entrypoint
├── api/v1/           # REST API handlers
├── schemas/          # Pydantic request/response models
├── models/           # SQLAlchemy ORM models
├── adapters/         # Vector store adapters
├── activities/       # Temporal activity functions
├── workflows/        # Temporal workflow definitions
└── services/         # Business logic layer
```

---

## Setup

```bash
# Install uv
curl -LsSf https://astral.sh/uv/install.sh | sh

# Install dependencies (including dev)
uv sync

# Start backing services (PostgreSQL, Temporal, Chroma)
docker compose up postgres temporal temporal-ui chroma -d

# Apply migrations
alembic upgrade head
```

---

## Running Tests

```bash
# Run all tests
uv run pytest

# With coverage
uv run pytest --cov=vectorhouse --cov-report=term-missing

# Run a specific file
uv run pytest tests/api/test_collections.py -v

# Run a specific test
uv run pytest tests/api/test_query.py::test_query_dense -v
```

Tests use `pytest-asyncio` for async test support. The `conftest.py` provides fixtures for the test database, mock adapters, and test clients.

---

## Linting & Formatting

```bash
# Lint
uv run ruff check src/

# Auto-fix
uv run ruff check --fix src/

# Format
uv run ruff format src/
```

---

## Adding a New Vector Store Adapter

1. Create `src/vectorhouse/adapters/{name}_adapter.py`
2. Implement `VectorStoreAdapter` — all 7 abstract methods
3. Add configuration variables to `config.py`
4. Register in `main.py` `lifespan()`:

```python
registry.register("{name}", YourAdapter(config_values))
```

5. Add a test in `tests/adapters/test_{name}_adapter.py`

See the [Adapters documentation](concepts/adapters.md) for a full example.

---

## Adding a New Temporal Activity

1. Create `src/vectorhouse/activities/{name}.py`
2. Decorate the function with `@activity.defn`:

```python
from temporalio import activity

@activity.defn
async def my_new_activity(input: MyActivityInput) -> MyActivityResult:
    # ... implementation
    return MyActivityResult(...)
```

3. Register it in `worker.py`:

```python
worker = Worker(
    client,
    task_queue=settings.temporal_task_queue,
    workflows=[IngestSingleWorkflow, IngestBatchWorkflow],
    activities=[
        validate_contract,
        generate_embedding,
        dedup_check,
        write_to_store,
        audit_log,
        my_new_activity,    # ← add here
    ]
)
```

4. Call it from the appropriate workflow using `await workflow.execute_activity(my_new_activity, input, ...)`

---

## Adding a New IR Metric

1. Add the computation to `src/vectorhouse/services/metrics.py`:

```python
def my_metric_at_k(relevant_ids: list[str], returned_ids: list[str], k: int) -> float:
    # ... compute metric
    return score
```

2. Call it in `EvalService.execute_run()` alongside the existing metrics
3. Add the field to `EvalResult` model and migration

---

## Database Migrations

When changing the ORM models:

```bash
# Auto-generate a migration from model diff
alembic revision --autogenerate -m "add_my_column"

# Review the generated file in alembic/versions/
# Then apply
alembic upgrade head
```

Always review auto-generated migrations before applying — Alembic may not capture all changes correctly (e.g., index types, default expressions).

---

## Environment for Tests

Tests use a separate test database. Configure via:

```bash
export VH_POSTGRES_URL="postgresql+asyncpg://postgres:postgres@localhost:5432/vectorhouse_test"
export VH_POSTGRES_SYNC_URL="postgresql://postgres:postgres@localhost:5432/vectorhouse_test"
```

Or rely on the fixtures in `tests/conftest.py` which spin up an in-memory SQLite database for unit tests.

---

## Performance Testing

VAJRA targets:

| Metric | Target |
|--------|--------|
| Query latency overhead (p99) | < 5 ms over direct store call |
| Ingest throughput (single node) | > 10,000 vectors/second |
| Single record ingest latency (p99) | < 20 ms |
| Policy evaluation (p99) | < 2 ms |

Use `pytest-benchmark` or `locust` for load testing ingest and query endpoints.

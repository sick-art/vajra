# VAJRA — VectorHouse

> Data Virtualization & Governance Platform for Vector Databases.

VAJRA (codename **VectorHouse**) is a unified control plane for ingesting, governing, and serving vector data across heterogeneous vector stores (LanceDB, Chroma, and more). It pairs durable Temporal-orchestrated pipelines with a typed FastAPI surface and a React UI to make embedding workflows reproducible, auditable, and easy to operate.

---

## Documentation

Full documentation is hosted at **<http://aartityagi.in/vajra>**.

- Architecture, pipelines, API reference, concepts and deployment guides all live there.
- Source for the docs lives in [`docs/`](docs/) and is built with [MkDocs Material](https://squidfunk.github.io/mkdocs-material/) — see [`mkdocs.yml`](mkdocs.yml).

---

## Repository layout

| Path | Description |
| ---- | ----------- |
| [`src/vectorhouse/`](src/vectorhouse/) | Python service: FastAPI app, Temporal worker, adapters, services |
| [`frontend/`](frontend/) | React + Vite UI (TypeScript) |
| [`alembic/`](alembic/) | Database migrations |
| [`scripts/`](scripts/) | Operational scripts (DB init, etc.) |
| [`docs/`](docs/) | MkDocs documentation source |
| [`tests/`](tests/) | Pytest suite |
| [`docker-compose.yml`](docker-compose.yml) | Local stack: Postgres, Temporal, Chroma, API, worker, frontend |
| [`spec.md`](spec.md) | Product / system specification |

---

## Quick start (local dev)

Prerequisites: Docker, [`uv`](https://docs.astral.sh/uv/), Node.js ≥ 20.

```bash
# 1. Bring up the full stack
docker compose up --build

# 2. API:        http://localhost:8000
#    Frontend:   http://localhost:3000
#    Temporal UI: http://localhost:8088
```

For a Python-only dev loop:

```bash
uv sync
uv run alembic upgrade head
uv run uvicorn vectorhouse.main:app --reload
uv run python -m vectorhouse.worker
```

For docs:

```bash
uv run mkdocs serve   # → http://localhost:8000
```

See the [Development Guide](http://aartityagi.in/vajra/development/) and [Deployment Guide](http://aartityagi.in/vajra/deployment/) for the full workflow.

---

## Configuration

All runtime config is read from environment variables prefixed with `VH_` (see [`src/vectorhouse/config.py`](src/vectorhouse/config.py)). Local overrides go in a `.env` file — **never commit `.env` or any file containing keys, tokens, or credentials**; `.gitignore` enforces this.

Reference: [Configuration docs](http://aartityagi.in/vajra/configuration/).

---

## License

TBD.

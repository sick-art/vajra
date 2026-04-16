import asyncio
from typing import Any
from unittest.mock import AsyncMock

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from vectorhouse.adapters.base import QueryResult, VectorRecord, VectorStoreAdapter
from vectorhouse.adapters.registry import AdapterRegistry
from vectorhouse.main import create_app
from vectorhouse.models.db import Base
from vectorhouse.services.audit import AuditService
from vectorhouse.services.embedding import EmbeddingService
from vectorhouse.services.federation import FederationService
from vectorhouse.services.query_service import QueryService


class MockAdapter(VectorStoreAdapter):
    """In-memory adapter for testing."""

    def __init__(self) -> None:
        self._store: dict[str, dict[str, VectorRecord]] = {}

    def _get_collection(self, name: str) -> dict[str, VectorRecord]:
        return self._store.setdefault(name, {})

    async def upsert(self, collection: str, records: list[VectorRecord]) -> int:
        coll = self._get_collection(collection)
        for r in records:
            coll[r.id] = r
        return len(records)

    async def query(
        self,
        collection: str,
        vector: list[float],
        top_k: int = 10,
        filter: dict[str, Any] | None = None,
    ) -> list[QueryResult]:
        coll = self._get_collection(collection)
        results = []
        for r in coll.values():
            results.append(QueryResult(id=r.id, score=0.5, metadata=r.metadata, text=r.text))
        return results[:top_k]

    async def hybrid_query(
        self,
        collection: str,
        vector: list[float],
        query_text: str,
        top_k: int = 10,
        filter: dict[str, Any] | None = None,
    ) -> list[QueryResult]:
        return await self.query(collection, vector, top_k, filter)

    async def delete(self, collection: str, ids: list[str]) -> int:
        coll = self._get_collection(collection)
        count = 0
        for id_ in ids:
            if id_ in coll:
                del coll[id_]
                count += 1
        return count

    async def list_collections(self) -> list[str]:
        return list(self._store.keys())

    async def health(self) -> dict[str, Any]:
        return {"status": "ok"}

    async def get_collection_stats(self, collection: str) -> dict[str, Any]:
        coll = self._get_collection(collection)
        return {"count": len(coll), "dimensions": 384}


class MockEmbeddingService:
    def __init__(self):
        self.dimensions = 384

    def encode(self, texts: list[str]) -> list[list[float]]:
        return [[0.1] * self.dimensions for _ in texts]

    def encode_single(self, text: str) -> list[float]:
        return [0.1] * self.dimensions


@pytest_asyncio.fixture
async def test_db():
    engine = create_async_engine("sqlite+aiosqlite:///test.db", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    yield session_factory

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture
async def app(test_db):
    from vectorhouse.main import create_app

    application = create_app()

    registry = AdapterRegistry()
    registry.register("lancedb", MockAdapter())
    registry.register("chroma", MockAdapter())

    embedding = MockEmbeddingService()
    federation = FederationService(registry)
    audit = AuditService(test_db)
    query_svc = QueryService(federation, embedding, audit)

    application.state.db = test_db
    application.state.engine = test_db.kw.get("bind")
    application.state.temporal_client = None
    application.state.embedding_service = embedding
    application.state.registry = registry
    application.state.query_service = query_svc
    application.state.audit_service = audit
    application.state.settings = type("S", (), {
        "temporal_task_queue": "test",
        "temporal_host": "localhost:7233",
        "temporal_namespace": "default",
    })()

    yield application


@pytest_asyncio.fixture
async def client(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c

import pytest

from vectorhouse.adapters.lancedb_adapter import LanceDBAdapter
from vectorhouse.adapters.base import VectorRecord


@pytest.fixture
def adapter(tmp_path):
    return LanceDBAdapter(str(tmp_path / "test_lance"))


@pytest.mark.asyncio
async def test_query_missing_table_returns_empty(adapter):
    """query() on a non-existent table should return [] not raise."""
    results = await adapter.query("nonexistent", [0.1] * 128, top_k=1)
    assert results == []


@pytest.mark.asyncio
async def test_delete_missing_table_returns_zero(adapter):
    """delete() on a non-existent table should return 0."""
    count = await adapter.delete("nonexistent", ["id1"])
    assert count == 0


@pytest.mark.asyncio
async def test_get_collection_stats_missing_table(adapter):
    """get_collection_stats() on a non-existent table should return zeros."""
    stats = await adapter.get_collection_stats("nonexistent")
    assert stats == {"count": 0, "dimensions": 0}


@pytest.mark.asyncio
async def test_upsert_creates_table_then_query_returns_results(adapter):
    """upsert() should create the table if it doesn't exist, and query should find records."""
    vec = [0.1] * 128
    records = [VectorRecord(id="doc1", vector=vec, metadata={"src": "test"}, text="hello")]
    count = await adapter.upsert("my-collection", records)
    assert count == 1

    results = await adapter.query("my-collection", vec, top_k=1)
    assert len(results) == 1
    assert results[0].id == "doc1"

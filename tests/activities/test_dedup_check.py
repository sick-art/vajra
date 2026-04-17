"""Tests for dedup_check activity logic (no external services needed)."""

import pytest

from vectorhouse.adapters.base import QueryResult, VectorRecord
from vectorhouse.adapters.registry import AdapterRegistry
from tests.conftest import MockAdapter


@pytest.fixture
def registry():
    reg = AdapterRegistry()
    reg.register("lancedb", MockAdapter())
    return reg


@pytest.mark.asyncio
async def test_dedup_no_existing_records(registry, monkeypatch):
    """Empty collection returns False (no duplicate)."""
    import vectorhouse.activities.dedup_check as mod

    monkeypatch.setattr(mod, "_registry", registry)

    result = await mod.dedup_check("my-col", "lancedb", "rec-1", [0.1] * 384)
    assert result is False


@pytest.mark.asyncio
async def test_dedup_same_record_id_is_not_duplicate(registry, monkeypatch):
    """If the nearest neighbor has the same ID, it's an update, not a dup."""
    import vectorhouse.activities.dedup_check as mod

    adapter = registry.get("lancedb")
    await adapter.upsert("my-col", [
        VectorRecord(id="rec-1", vector=[0.1] * 384, metadata={}, text="hello"),
    ])

    monkeypatch.setattr(mod, "_registry", registry)

    result = await mod.dedup_check("my-col", "lancedb", "rec-1", [0.1] * 384)
    assert result is False


@pytest.mark.asyncio
async def test_dedup_different_record_with_empty_metadata(registry, monkeypatch):
    """A different record with empty metadata should not crash (the original np.dot bug)."""
    import vectorhouse.activities.dedup_check as mod

    adapter = registry.get("lancedb")
    await adapter.upsert("my-col", [
        VectorRecord(id="rec-existing", vector=[0.1] * 384, metadata={}, text="hello"),
    ])

    monkeypatch.setattr(mod, "_registry", registry)

    # This would crash with the old np.dot code: shapes (384,) and (0,)
    result = await mod.dedup_check("my-col", "lancedb", "rec-new", [0.1] * 384)
    # MockAdapter returns score=0.5, so similarity = 1/(1+0.5) = 0.667, below 0.98
    assert result is False


@pytest.mark.asyncio
async def test_dedup_high_similarity_is_duplicate(registry, monkeypatch):
    """A very close match (low distance) should be flagged as duplicate."""
    import vectorhouse.activities.dedup_check as mod

    # Create a custom adapter that returns a near-zero distance
    class NearDupAdapter(MockAdapter):
        async def query(self, collection, vector, top_k=10, filter=None):
            return [QueryResult(id="other-rec", score=0.001, metadata={}, text="hi")]

    reg = AdapterRegistry()
    reg.register("lancedb", NearDupAdapter())
    monkeypatch.setattr(mod, "_registry", reg)

    # similarity = 1/(1+0.001) ≈ 0.999, above 0.98 threshold
    result = await mod.dedup_check("my-col", "lancedb", "rec-new", [0.1] * 384)
    assert result is True

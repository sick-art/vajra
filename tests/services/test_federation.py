import pytest

from vectorhouse.schemas.query import ScoredResult
from vectorhouse.services.federation import FederationService


@pytest.fixture
def federation():
    from tests.conftest import MockAdapter
    from vectorhouse.adapters.registry import AdapterRegistry

    registry = AdapterRegistry()
    registry.register("lancedb", MockAdapter())
    registry.register("chroma", MockAdapter())
    return FederationService(registry)


def test_normalize_score_lancedb(federation):
    # L2 distance of 0 should give similarity of 1.0
    assert federation._normalize_score(0.0, "lancedb") == 1.0
    # L2 distance of 1 should give similarity ~0.5
    assert federation._normalize_score(1.0, "lancedb") == 0.5


def test_normalize_score_chroma(federation):
    assert federation._normalize_score(0.0, "chroma") == 1.0
    assert federation._normalize_score(1.0, "chroma") == 0.5


def test_rrf_merge(federation):
    results = [
        ScoredResult(id="a", score=0.9, metadata={}, store_type="lancedb"),
        ScoredResult(id="b", score=0.8, metadata={}, store_type="lancedb"),
        ScoredResult(id="a", score=0.95, metadata={}, store_type="chroma"),
        ScoredResult(id="c", score=0.7, metadata={}, store_type="chroma"),
    ]
    merged = federation._rrf_merge(results, top_k=3)
    # "a" appears in both stores, should rank highest via RRF
    assert merged[0].id == "a"
    assert len(merged) <= 3


def test_apply_metadata_filter(federation):
    results = [
        ScoredResult(id="1", score=0.9, metadata={"category": "tech"}, store_type="lancedb"),
        ScoredResult(id="2", score=0.8, metadata={"category": "sports"}, store_type="lancedb"),
        ScoredResult(id="3", score=0.7, metadata={"category": "tech"}, store_type="chroma"),
    ]
    filtered = federation._apply_metadata_filter(results, {"category": "tech"})
    assert len(filtered) == 2
    assert all(r.metadata["category"] == "tech" for r in filtered)


def test_apply_metadata_filter_with_list(federation):
    results = [
        ScoredResult(id="1", score=0.9, metadata={"category": "tech"}, store_type="lancedb"),
        ScoredResult(id="2", score=0.8, metadata={"category": "sports"}, store_type="lancedb"),
        ScoredResult(id="3", score=0.7, metadata={"category": "news"}, store_type="chroma"),
    ]
    filtered = federation._apply_metadata_filter(results, {"category": ["tech", "news"]})
    assert len(filtered) == 2

from temporalio import activity

from vectorhouse.adapters.base import VectorRecord
from vectorhouse.adapters.registry import AdapterRegistry

_registry: AdapterRegistry | None = None


def _get_registry() -> AdapterRegistry:
    global _registry
    if _registry is None:
        from vectorhouse.adapters.chroma_adapter import ChromaAdapter
        from vectorhouse.adapters.lancedb_adapter import LanceDBAdapter
        from vectorhouse.config import settings

        _registry = AdapterRegistry()
        _registry.register("lancedb", LanceDBAdapter(settings.lancedb_path))
        _registry.register("chroma", ChromaAdapter(settings.chroma_host, settings.chroma_port))
    return _registry


@activity.defn
async def dedup_check(
    collection: str,
    store_type: str,
    record_id: str,
    vector: list[float],
    threshold: float = 0.98,
) -> bool:
    """Check if a near-duplicate vector already exists.

    Returns True if a duplicate was found (should skip).
    """
    registry = _get_registry()
    adapter = registry.get(store_type)

    results = await adapter.query(collection, vector, top_k=1)
    if not results:
        return False

    # If the top result is the same record, it's an update, not a duplicate
    if results[0].id == record_id:
        return False

    # Compute cosine similarity: both vectors should be unit-normalized
    import numpy as np

    similarity = float(np.dot(vector, results[0].metadata.get("_vector", [])))
    # Since we can't easily get the raw vector back, use the score (L2 distance)
    # Convert L2 distance to cosine similarity approximation
    distance = results[0].score
    similarity = 1.0 / (1.0 + distance)

    return similarity >= threshold

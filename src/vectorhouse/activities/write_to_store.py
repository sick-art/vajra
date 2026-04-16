from typing import Any

from temporalio import activity

from vectorhouse.adapters.base import VectorRecord


@activity.defn
async def write_to_store(
    collection: str,
    store_type: str,
    record_id: str,
    vector: list[float],
    text: str | None,
    metadata: dict[str, Any],
) -> int:
    """Write a record to the vector store via the adapter."""
    from vectorhouse.activities.dedup_check import _get_registry

    registry = _get_registry()
    adapter = registry.get(store_type)

    record = VectorRecord(
        id=record_id,
        vector=vector,
        metadata=metadata,
        text=text,
    )
    count = await adapter.upsert(collection, [record])
    return count

from typing import Any

from vectorhouse.adapters.base import VectorStoreAdapter


class AdapterRegistry:
    """Registry mapping store type names to adapter instances."""

    def __init__(self) -> None:
        self._adapters: dict[str, VectorStoreAdapter] = {}

    def register(self, store_type: str, adapter: VectorStoreAdapter) -> None:
        self._adapters[store_type] = adapter

    def get(self, store_type: str) -> VectorStoreAdapter:
        if store_type not in self._adapters:
            raise ValueError(f"Unknown store type: {store_type}")
        return self._adapters[store_type]

    def get_all(self) -> dict[str, VectorStoreAdapter]:
        return dict(self._adapters)

    def has(self, store_type: str) -> bool:
        return store_type in self._adapters

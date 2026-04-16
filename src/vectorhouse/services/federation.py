import asyncio
import logging
from typing import Any

from vectorhouse.adapters.base import QueryResult, VectorStoreAdapter
from vectorhouse.adapters.registry import AdapterRegistry
from vectorhouse.schemas.query import ScoredResult

logger = logging.getLogger(__name__)


class FederationService:
    def __init__(self, registry: AdapterRegistry) -> None:
        self.registry = registry

    async def federated_query(
        self,
        vector: list[float],
        query_text: str | None,
        top_k: int,
        filter: dict[str, Any] | None,
        store_types: list[str] | None = None,
        search_type: str = "dense",
        collection_store_name: str | None = None,
    ) -> list[ScoredResult]:
        # Determine which adapters to query
        adapters = self._resolve_adapters(store_types)

        # Fan out queries in parallel
        tasks = []
        for store_type, adapter in adapters.items():
            coll = collection_store_name or ""
            if search_type == "hybrid" and query_text:
                tasks.append(
                    self._run_hybrid(adapter, store_type, coll, vector, query_text, top_k, filter)
                )
            else:
                tasks.append(
                    self._run_dense(adapter, store_type, coll, vector, top_k, filter)
                )

        results_per_store = await asyncio.gather(*tasks, return_exceptions=True)

        # Collect results
        all_results: list[ScoredResult] = []
        stores_queried = []
        for (store_type, _), results in zip(adapters.items(), results_per_store):
            if isinstance(results, Exception):
                logger.warning("Query to %s failed: %s", store_type, results)
                continue
            stores_queried.append(store_type)
            for r in results:
                normalized = self._normalize_score(r.score, store_type)
                all_results.append(
                    ScoredResult(
                        id=r.id,
                        score=normalized,
                        metadata=r.metadata,
                        text=r.text,
                        store_type=store_type,
                    )
                )

        # Merge results
        if len(stores_queried) > 1:
            all_results = self._rrf_merge(all_results, top_k)
        else:
            all_results.sort(key=lambda x: x.score, reverse=True)
            all_results = all_results[:top_k]

        # Post-merge metadata filtering
        if filter:
            all_results = self._apply_metadata_filter(all_results, filter)

        return all_results[:top_k]

    def _resolve_adapters(
        self, store_types: list[str] | None = None
    ) -> dict[str, VectorStoreAdapter]:
        all_adapters = self.registry.get_all()
        if store_types:
            return {k: v for k, v in all_adapters.items() if k in store_types}
        return all_adapters

    async def _run_dense(
        self,
        adapter: VectorStoreAdapter,
        store_type: str,
        collection: str,
        vector: list[float],
        top_k: int,
        filter: dict[str, Any] | None,
    ) -> list[QueryResult]:
        return await adapter.query(collection, vector, top_k, filter)

    async def _run_hybrid(
        self,
        adapter: VectorStoreAdapter,
        store_type: str,
        collection: str,
        vector: list[float],
        query_text: str,
        top_k: int,
        filter: dict[str, Any] | None,
    ) -> list[QueryResult]:
        return await adapter.hybrid_query(collection, vector, query_text, top_k, filter)

    def _normalize_score(self, score: float, store_type: str) -> float:
        """Convert backend-specific scores to 0-1 similarity range.

        Both LanceDB and Chroma return L2 distances by default.
        Convert to similarity: 1 / (1 + distance)
        """
        return 1.0 / (1.0 + abs(score))

    def _rrf_merge(self, results: list[ScoredResult], top_k: int) -> list[ScoredResult]:
        """Reciprocal Rank Fusion with k=60."""
        k = 60
        rrf_scores: dict[str, float] = {}
        result_map: dict[str, ScoredResult] = {}

        # Group by store, sort by score within each store
        by_store: dict[str, list[ScoredResult]] = {}
        for r in results:
            by_store.setdefault(r.store_type, []).append(r)

        for store_type, store_results in by_store.items():
            store_results.sort(key=lambda x: x.score, reverse=True)
            for rank, r in enumerate(store_results, 1):
                rrf_scores[r.id] = rrf_scores.get(r.id, 0.0) + 1.0 / (k + rank)
                if r.id not in result_map:
                    result_map[r.id] = r

        merged = sorted(rrf_scores.items(), key=lambda x: x[1], reverse=True)
        return [result_map[id_] for id_, _ in merged[:top_k]]

    def _apply_metadata_filter(
        self, results: list[ScoredResult], filter: dict[str, Any]
    ) -> list[ScoredResult]:
        filtered = []
        for r in results:
            match = True
            for key, value in filter.items():
                if key not in r.metadata:
                    match = False
                    break
                if isinstance(value, list):
                    if r.metadata[key] not in value:
                        match = False
                        break
                elif r.metadata[key] != value:
                    match = False
                    break
            if match:
                filtered.append(r)
        return filtered

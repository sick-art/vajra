"""Evaluation service: manages datasets, runs, and computes IR metrics."""

from __future__ import annotations

import logging
import statistics
import time
import uuid
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import async_sessionmaker, AsyncSession

from vectorhouse.models.eval import EvalDataset, EvalQuery, EvalResult, EvalRun, EvalRunMetrics
from vectorhouse.services.metrics import ndcg, precision_at_k, recall_at_k
from vectorhouse.services.query_service import QueryService

logger = logging.getLogger(__name__)


class EvalService:
    def __init__(self, session_factory: async_sessionmaker[AsyncSession], query_service: QueryService):
        self._session_factory = session_factory
        self._query_service = query_service

    async def create_dataset(
        self,
        name: str,
        collection: str,
        description: str | None = None,
        queries: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        async with self._session_factory() as session:
            ds = EvalDataset(
                name=name,
                description=description,
                collection=collection,
                query_count=len(queries or []),
            )
            session.add(ds)

            for q in (queries or []):
                eq = EvalQuery(
                    dataset=ds,
                    query_text=q["query_text"],
                    relevant_ids=q.get("relevant_ids", []),
                    relevance_scores=q.get("relevance_scores", []),
                    metadata_=q.get("metadata", {}),
                )
                session.add(eq)

            await session.commit()
            await session.refresh(ds)

            result = {
                "id": str(ds.id),
                "name": ds.name,
                "description": ds.description,
                "collection": ds.collection,
                "query_count": ds.query_count,
                "created_at": ds.created_at.isoformat() if ds.created_at else None,
                "queries": [],
            }

            # Fetch queries
            q_rows = (await session.execute(select(EvalQuery).where(EvalQuery.dataset_id == ds.id))).scalars().all()
            result["queries"] = [
                {
                    "id": str(q.id),
                    "dataset_id": str(q.dataset_id),
                    "query_text": q.query_text,
                    "relevant_ids": q.relevant_ids,
                    "relevance_scores": q.relevance_scores,
                    "metadata": q.metadata_,
                }
                for q in q_rows
            ]

            return result

    async def list_datasets(self) -> list[dict[str, Any]]:
        async with self._session_factory() as session:
            rows = (await session.execute(select(EvalDataset).order_by(EvalDataset.created_at.desc()))).scalars().all()
            return [
                {
                    "id": str(ds.id),
                    "name": ds.name,
                    "description": ds.description,
                    "collection": ds.collection,
                    "query_count": ds.query_count,
                    "created_at": ds.created_at.isoformat() if ds.created_at else None,
                }
                for ds in rows
            ]

    async def get_dataset(self, dataset_id: str) -> dict[str, Any] | None:
        async with self._session_factory() as session:
            ds = await session.get(EvalDataset, uuid.UUID(dataset_id))
            if not ds:
                return None

            q_rows = (await session.execute(select(EvalQuery).where(EvalQuery.dataset_id == ds.id))).scalars().all()

            return {
                "id": str(ds.id),
                "name": ds.name,
                "description": ds.description,
                "collection": ds.collection,
                "query_count": ds.query_count,
                "created_at": ds.created_at.isoformat() if ds.created_at else None,
                "queries": [
                    {
                        "id": str(q.id),
                        "dataset_id": str(q.dataset_id),
                        "query_text": q.query_text,
                        "relevant_ids": q.relevant_ids,
                        "relevance_scores": q.relevance_scores,
                        "metadata": q.metadata_,
                    }
                    for q in q_rows
                ],
            }

    async def delete_dataset(self, dataset_id: str) -> bool:
        async with self._session_factory() as session:
            ds = await session.get(EvalDataset, uuid.UUID(dataset_id))
            if not ds:
                return False
            await session.delete(ds)
            await session.commit()
            return True

    async def create_run(
        self,
        dataset_id: str,
        name: str,
        store_type: str | None = None,
        embedding_model: str | None = None,
        top_k: int = 10,
        search_type: str = "dense",
    ) -> dict[str, Any]:
        async with self._session_factory() as session:
            run = EvalRun(
                dataset_id=uuid.UUID(dataset_id),
                name=name,
                store_type=store_type,
                embedding_model=embedding_model,
                top_k=top_k,
                search_type=search_type,
                status="pending",
            )
            session.add(run)
            await session.commit()
            await session.refresh(run)

            return self._run_to_dict(run)

    async def execute_run(self, run_id: str) -> dict[str, Any]:
        """Execute an evaluation run: query for each eval query, compute metrics, store results."""
        async with self._session_factory() as session:
            run = await session.get(EvalRun, uuid.UUID(run_id))
            if not run:
                raise ValueError(f"Run {run_id} not found")

            # Update status to running
            run.status = "running"
            await session.commit()

        # Load dataset queries
        async with self._session_factory() as session:
            run = await session.get(EvalRun, uuid.UUID(run_id))
            queries = (
                await session.execute(
                    select(EvalQuery).where(EvalQuery.dataset_id == run.dataset_id)
                )
            ).scalars().all()

            dataset = await session.get(EvalDataset, run.dataset_id)
            collection_name = dataset.collection if dataset else ""

        ndcg_scores: list[float] = []
        recall_scores: list[float] = []
        precision_scores: list[float] = []
        latencies: list[float] = []

        for eq in queries:
            start = time.monotonic()
            try:
                query_resp = await self._query_service.execute(
                    collection=collection_name,
                    query_text=eq.query_text,
                    top_k=run.top_k,
                    filter=None,
                    store_types=[run.store_type] if run.store_type else None,
                    search_type=run.search_type,
                    collection_store_name=None,
                )
            except Exception as e:
                logger.warning("Query failed for eval query %s: %s", eq.id, e)
                query_resp = None

            latency = (time.monotonic() - start) * 1000
            latencies.append(latency)

            returned_ids = [r.id for r in query_resp.results] if query_resp else []
            returned_scores = [r.score for r in query_resp.results] if query_resp else []

            ndcg_val = ndcg(returned_ids, eq.relevant_ids, eq.relevance_scores or None, k=run.top_k)
            recall_val = recall_at_k(returned_ids, eq.relevant_ids, k=run.top_k)
            precision_val = precision_at_k(returned_ids, eq.relevant_ids, k=run.top_k)

            ndcg_scores.append(ndcg_val)
            recall_scores.append(recall_val)
            precision_scores.append(precision_val)

            # Store per-query result
            async with self._session_factory() as session:
                result = EvalResult(
                    run_id=uuid.UUID(run_id),
                    query_id=eq.id,
                    returned_ids=returned_ids,
                    returned_scores=returned_scores,
                    ndcg=ndcg_val,
                    recall_at_k=recall_val,
                    precision_at_k=precision_val,
                    latency_ms=latency,
                    metadata_={},
                )
                session.add(result)
                await session.commit()

        # Compute aggregate metrics
        def safe_median(vals: list[float]) -> float | None:
            return statistics.median(vals) if vals else None

        def safe_p95(vals: list[float]) -> float | None:
            if not vals:
                return None
            sorted_vals = sorted(vals)
            idx = int(len(sorted_vals) * 0.95)
            return sorted_vals[min(idx, len(sorted_vals) - 1)]

        avg_ndcg = statistics.mean(ndcg_scores) if ndcg_scores else 0.0
        avg_recall = statistics.mean(recall_scores) if recall_scores else 0.0
        avg_precision = statistics.mean(precision_scores) if precision_scores else 0.0

        # Store aggregate metrics and update run
        async with self._session_factory() as session:
            run = await session.get(EvalRun, uuid.UUID(run_id))
            if not run:
                raise ValueError(f"Run {run_id} not found")

            metrics = EvalRunMetrics(
                run=run,
                avg_ndcg=avg_ndcg,
                avg_recall_at_k=avg_recall,
                avg_precision_at_k=avg_precision,
                median_ndcg=safe_median(ndcg_scores),
                median_recall_at_k=safe_median(recall_scores),
                median_precision_at_k=safe_median(precision_scores),
                p95_latency_ms=safe_p95(latencies),
                total_queries=len(queries),
                metadata_={},
            )
            session.add(metrics)

            run.status = "completed"
            from datetime import datetime, timezone
            run.completed_at = datetime.now(timezone.utc)
            await session.commit()

            return await self.get_run(run_id)

    async def list_runs(self, dataset_id: str | None = None) -> list[dict[str, Any]]:
        async with self._session_factory() as session:
            stmt = select(EvalRun).order_by(EvalRun.created_at.desc())
            if dataset_id:
                stmt = stmt.where(EvalRun.dataset_id == uuid.UUID(dataset_id))
            rows = (await session.execute(stmt)).scalars().all()
            return [self._run_to_dict(r) for r in rows]

    async def get_run(self, run_id: str) -> dict[str, Any] | None:
        async with self._session_factory() as session:
            run = await session.get(EvalRun, uuid.UUID(run_id))
            if not run:
                return None

            result = self._run_to_dict(run)

            # Get metrics
            metrics_row = (
                await session.execute(select(EvalRunMetrics).where(EvalRunMetrics.run_id == run.id))
            ).scalar_one_or_none()

            if metrics_row:
                result["metrics"] = {
                    "avg_ndcg": metrics_row.avg_ndcg,
                    "avg_recall_at_k": metrics_row.avg_recall_at_k,
                    "avg_precision_at_k": metrics_row.avg_precision_at_k,
                    "median_ndcg": metrics_row.median_ndcg,
                    "median_recall_at_k": metrics_row.median_recall_at_k,
                    "median_precision_at_k": metrics_row.median_precision_at_k,
                    "p95_latency_ms": metrics_row.p95_latency_ms,
                    "total_queries": metrics_row.total_queries,
                }
            else:
                result["metrics"] = None

            return result

    async def get_run_results(self, run_id: str) -> list[dict[str, Any]]:
        async with self._session_factory() as session:
            result_rows = (
                await session.execute(
                    select(EvalResult, EvalQuery.query_text)
                    .join(EvalQuery, EvalResult.query_id == EvalQuery.id)
                    .where(EvalResult.run_id == uuid.UUID(run_id))
                )
            ).all()

            return [
                {
                    "id": str(r.id),
                    "run_id": str(r.run_id),
                    "query_id": str(r.query_id),
                    "query_text": qt,
                    "returned_ids": r.returned_ids,
                    "returned_scores": r.returned_scores,
                    "ndcg": r.ndcg,
                    "recall_at_k": r.recall_at_k,
                    "precision_at_k": r.precision_at_k,
                    "latency_ms": r.latency_ms,
                    "metadata": r.metadata_,
                }
                for r, qt in result_rows
            ]

    @staticmethod
    def _run_to_dict(run: EvalRun) -> dict[str, Any]:
        return {
            "id": str(run.id),
            "dataset_id": str(run.dataset_id),
            "name": run.name,
            "store_type": run.store_type,
            "embedding_model": run.embedding_model,
            "top_k": run.top_k,
            "search_type": run.search_type,
            "status": run.status,
            "workflow_id": run.workflow_id,
            "created_at": run.created_at.isoformat() if run.created_at else None,
            "completed_at": run.completed_at.isoformat() if run.completed_at else None,
        }

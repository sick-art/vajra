import asyncio
from dataclasses import dataclass, field
from datetime import timedelta
from typing import Any

from temporalio import workflow

with workflow.unsafe.imports_passed_through():
    from vectorhouse.activities.audit_log import audit_log
    from vectorhouse.workflows.ingest_single import (
        IngestSingleParams,
        IngestSingleResult,
        IngestSingleWorkflow,
    )


@dataclass
class IngestBatchParams:
    collection: str
    store_type: str
    store_name: str
    records: list[dict[str, Any]] = field(default_factory=list)
    dimensions: int = 384


@dataclass
class IngestBatchResult:
    total: int
    success: int = 0
    failed: int = 0
    duplicates: int = 0


@workflow.defn
class IngestBatchWorkflow:
    @workflow.run
    async def run(self, params: IngestBatchParams) -> IngestBatchResult:
        # Fan out to child workflows for each record
        children = []
        for record in params.records:
            child_params = IngestSingleParams(
                collection=params.collection,
                store_type=params.store_type,
                store_name=params.store_name,
                record_id=record["id"],
                text=record.get("text"),
                vector=record.get("vector"),
                metadata=record.get("metadata", {}),
                dimensions=params.dimensions,
            )
            children.append(
                workflow.execute_child_workflow(
                    IngestSingleWorkflow.run,
                    child_params,
                    id=f"ingest-{params.collection}-{record['id']}",
                    retry_policy=workflow.RetryPolicy(maximum_attempts=1),
                )
            )

        child_results = await asyncio.gather(*children, return_exceptions=True)

        success_count = 0
        failed_count = 0
        dup_count = 0

        for r in child_results:
            if isinstance(r, Exception):
                failed_count += 1
            elif isinstance(r, IngestSingleResult):
                if r.status == "success":
                    success_count += 1
                elif r.status == "duplicate_skipped":
                    dup_count += 1
                else:
                    failed_count += 1
            else:
                failed_count += 1

        # Batch audit
        await workflow.execute_activity(
            audit_log,
            args=[
                "batch_ingest",
                params.collection,
                "completed",
                params.store_type,
                len(params.records),
                None,
                None,
                None,
                {
                    "success": success_count,
                    "failed": failed_count,
                    "duplicates": dup_count,
                },
            ],
            start_to_close_timeout=timedelta(seconds=5),
            retry_policy=workflow.RetryPolicy(maximum_attempts=2),
        )

        return IngestBatchResult(
            total=len(params.records),
            success=success_count,
            failed=failed_count,
            duplicates=dup_count,
        )

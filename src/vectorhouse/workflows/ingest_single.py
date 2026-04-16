from dataclasses import dataclass
from datetime import timedelta
from typing import Any

from temporalio import workflow

with workflow.unsafe.imports_passed_through():
    from vectorhouse.activities.audit_log import audit_log
    from vectorhouse.activities.dedup_check import dedup_check
    from vectorhouse.activities.generate_embeddings import generate_embedding
    from vectorhouse.activities.validate_contract import validate_contract
    from vectorhouse.activities.write_to_store import write_to_store


@dataclass
class IngestSingleParams:
    collection: str
    store_type: str
    store_name: str
    record_id: str
    text: str | None = None
    vector: list[float] | None = None
    metadata: dict[str, Any] = None
    dimensions: int = 384

    def __post_init__(self):
        if self.metadata is None:
            self.metadata = {}


@dataclass
class IngestSingleResult:
    status: str  # "success", "rejected", "duplicate_skipped"
    error: str | None = None


@workflow.defn
class IngestSingleWorkflow:
    @workflow.run
    async def run(self, params: IngestSingleParams) -> IngestSingleResult:
        # Step 1: Validate contract
        validation = await workflow.execute_activity(
            validate_contract,
            args=[
                params.collection,
                params.store_name,
                params.record_id,
                params.text,
                params.vector,
                params.metadata,
                params.dimensions,
            ],
            start_to_close_timeout=timedelta(seconds=10),
            retry_policy=None,
        )

        if not validation.get("valid"):
            await workflow.execute_activity(
                audit_log,
                args=[
                    "ingest",
                    params.collection,
                    "rejected",
                    params.store_type,
                    1,
                    None,
                    validation.get("error"),
                    None,
                    {"record_id": params.record_id},
                ],
                start_to_close_timeout=timedelta(seconds=5),
            )
            return IngestSingleResult(status="rejected", error=validation.get("error"))

        # Step 2: Generate embedding if needed
        vector = params.vector
        if vector is None and params.text is not None:
            vector = await workflow.execute_activity(
                generate_embedding,
                params.text,
                start_to_close_timeout=timedelta(seconds=30),
            )

        if vector is None:
            await workflow.execute_activity(
                audit_log,
                args=[
                    "ingest",
                    params.collection,
                    "rejected",
                    params.store_type,
                    1,
                    None,
                    "No vector or text provided",
                    None,
                    {"record_id": params.record_id},
                ],
                start_to_close_timeout=timedelta(seconds=5),
            )
            return IngestSingleResult(status="rejected", error="No vector or text provided")

        # Step 3: Dedup check
        is_dup = await workflow.execute_activity(
            dedup_check,
            args=[
                params.store_name,
                params.store_type,
                params.record_id,
                vector,
            ],
            start_to_close_timeout=timedelta(seconds=10),
        )

        if is_dup:
            await workflow.execute_activity(
                audit_log,
                args=[
                    "ingest",
                    params.collection,
                    "duplicate_skipped",
                    params.store_type,
                    1,
                    None,
                    None,
                    None,
                    {"record_id": params.record_id},
                ],
                start_to_close_timeout=timedelta(seconds=5),
            )
            return IngestSingleResult(status="duplicate_skipped")

        # Step 4: Write to store
        await workflow.execute_activity(
            write_to_store,
            args=[
                params.store_name,
                params.store_type,
                params.record_id,
                vector,
                params.text,
                params.metadata,
            ],
            start_to_close_timeout=timedelta(seconds=15),
            retry_policy=workflow.RetryPolicy(
                maximum_attempts=3,
                backoff_coefficient=2.0,
            ),
        )

        # Step 5: Audit log
        await workflow.execute_activity(
            audit_log,
            args=[
                "ingest",
                params.collection,
                "success",
                params.store_type,
                1,
                None,
                None,
                None,
                {"record_id": params.record_id},
            ],
            start_to_close_timeout=timedelta(seconds=5),
            retry_policy=workflow.RetryPolicy(maximum_attempts=2),
        )

        return IngestSingleResult(status="success")

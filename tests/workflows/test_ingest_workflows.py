"""Tests that ingest workflows run against the live Temporal server in Docker (localhost:7233)."""

import uuid

import pytest
from temporalio import activity
from temporalio.client import Client
from temporalio.common import RetryPolicy
from temporalio.worker import Worker

from vectorhouse.activities.validate_contract import validate_contract
from vectorhouse.workflows.ingest_single import (
    IngestSingleParams,
    IngestSingleResult,
    IngestSingleWorkflow,
)


TEMPORAL_HOST = "localhost:7233"


# Stub activities that need external services (Postgres, vector stores)

@activity.defn(name="audit_log")
async def stub_audit_log(
    operation: str,
    collection: str,
    status: str,
    store_type: str | None = None,
    record_count: int | None = None,
    principal: str | None = None,
    error_message: str | None = None,
    latency_ms: float | None = None,
    metadata: dict | None = None,
) -> str:
    return "ok"


@activity.defn(name="dedup_check")
async def stub_dedup_check(
    collection: str,
    store_type: str,
    record_id: str,
    vector: list[float],
    threshold: float = 0.98,
) -> bool:
    return False


@activity.defn(name="generate_embedding")
async def stub_generate_embedding(text: str) -> list[float]:
    return [0.1] * 384


@activity.defn(name="write_to_store")
async def stub_write_to_store(
    collection: str,
    store_type: str,
    record_id: str,
    vector: list[float],
    text: str | None,
    metadata: dict,
) -> int:
    return 1


def test_retry_policy_import():
    """RetryPolicy must come from temporalio.common, not temporalio.workflow."""
    policy = RetryPolicy(maximum_attempts=3)
    assert policy.maximum_attempts == 3


@pytest.mark.asyncio
async def test_ingest_single_rejected():
    """A record with no text and no vector is rejected by validate_contract."""
    client = await Client.connect(TEMPORAL_HOST)
    task_queue = f"test-reject-{uuid.uuid4()}"

    async with Worker(
        client,
        task_queue=task_queue,
        workflows=[IngestSingleWorkflow],
        activities=[validate_contract, stub_audit_log],
    ):
        params = IngestSingleParams(
            collection="test-col",
            store_type="lancedb",
            store_name="test-col",
            record_id="rec-1",
            text=None,
            vector=None,
            dimensions=384,
        )
        result: IngestSingleResult = await client.execute_workflow(
            IngestSingleWorkflow.run,
            params,
            id=f"test-reject-{uuid.uuid4()}",
            task_queue=task_queue,
        )
        assert result.status == "rejected"
        assert "text or vector" in result.error


@pytest.mark.asyncio
async def test_ingest_single_success():
    """A record with text goes through embed → dedup → write → audit successfully."""
    client = await Client.connect(TEMPORAL_HOST)
    task_queue = f"test-success-{uuid.uuid4()}"

    async with Worker(
        client,
        task_queue=task_queue,
        workflows=[IngestSingleWorkflow],
        activities=[
            validate_contract,
            stub_generate_embedding,
            stub_dedup_check,
            stub_write_to_store,
            stub_audit_log,
        ],
    ):
        params = IngestSingleParams(
            collection="test-col",
            store_type="lancedb",
            store_name="test-col",
            record_id="rec-2",
            text="hello world",
            dimensions=384,
        )
        result: IngestSingleResult = await client.execute_workflow(
            IngestSingleWorkflow.run,
            params,
            id=f"test-success-{uuid.uuid4()}",
            task_queue=task_queue,
        )
        assert result.status == "success"
        assert result.error is None

import asyncio
import logging

from temporalio.client import Client
from temporalio.worker import Worker

from vectorhouse.activities.audit_log import audit_log
from vectorhouse.activities.dedup_check import dedup_check
from vectorhouse.activities.generate_embeddings import generate_embedding, generate_embeddings
from vectorhouse.activities.validate_contract import validate_contract
from vectorhouse.activities.write_to_store import write_to_store
from vectorhouse.config import settings
from vectorhouse.workflows.ingest_batch import IngestBatchWorkflow
from vectorhouse.workflows.ingest_single import IngestSingleWorkflow

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def main():
    logger.info("Connecting to Temporal at %s", settings.temporal_host)
    client = await Client.connect(
        settings.temporal_host,
        namespace=settings.temporal_namespace,
    )

    worker = Worker(
        client,
        task_queue=settings.temporal_task_queue,
        workflows=[IngestSingleWorkflow, IngestBatchWorkflow],
        activities=[
            validate_contract,
            generate_embedding,
            generate_embeddings,
            dedup_check,
            write_to_store,
            audit_log,
        ],
    )

    logger.info("Starting Temporal worker on task queue: %s", settings.temporal_task_queue)
    await worker.run()


if __name__ == "__main__":
    asyncio.run(main())

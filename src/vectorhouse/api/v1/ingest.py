from fastapi import APIRouter, HTTPException, Request
from sqlalchemy import select

from vectorhouse.models.db import Collection
from vectorhouse.schemas.ingest import IngestRequest, IngestResponse

router = APIRouter(prefix="/ingest", tags=["ingest"])


@router.post("/{collection}", response_model=IngestResponse)
async def ingest(collection: str, body: IngestRequest, request: Request):
    # Validate each record has text or vector
    for i, record in enumerate(body.records):
        if record.text is None and record.vector is None:
            raise HTTPException(
                status_code=422,
                detail=f"Record at index {i} must have either 'text' or 'vector'",
            )

    # Look up the collection
    async with request.app.state.db() as session:
        result = await session.execute(select(Collection).where(Collection.name == collection))
        coll = result.scalar_one_or_none()
        if not coll:
            raise HTTPException(status_code=404, detail=f"Collection '{collection}' not found")

    # Validate store type matches collection
    if coll.store_type != body.store_type:
        raise HTTPException(
            status_code=400,
            detail=f"Collection '{collection}' uses store_type '{coll.store_type}', "
            f"but request specifies '{body.store_type}'",
        )

    # Start Temporal workflow
    temporal_client = request.app.state.temporal_client
    if not temporal_client:
        raise HTTPException(status_code=503, detail="Temporal client not available")

    from temporalio.common import WorkflowIDReusePolicy

    from vectorhouse.workflows.ingest_batch import IngestBatchWorkflow, IngestBatchParams
    from vectorhouse.workflows.ingest_single import IngestSingleWorkflow, IngestSingleParams

    if len(body.records) == 1:
        record = body.records[0]
        params = IngestSingleParams(
            collection=collection,
            store_type=body.store_type,
            store_name=coll.store_name,
            record_id=record.id,
            text=record.text,
            vector=record.vector,
            metadata=record.metadata,
            dimensions=coll.dimensions,
        )
        workflow_id = body.idempotency_key or f"ingest-{collection}-{record.id}"
        result = await temporal_client.start_workflow(
            IngestSingleWorkflow.run,
            params,
            id=workflow_id,
            task_queue=request.app.state.settings.temporal_task_queue,
            id_reuse_policy=WorkflowIDReusePolicy.ALLOW_DUPLICATE,
        )
    else:
        params = IngestBatchParams(
            collection=collection,
            store_type=body.store_type,
            store_name=coll.store_name,
            records=[
                {
                    "id": r.id,
                    "text": r.text,
                    "vector": r.vector,
                    "metadata": r.metadata,
                }
                for r in body.records
            ],
            dimensions=coll.dimensions,
        )
        workflow_id = body.idempotency_key or f"ingest-batch-{collection}-{len(body.records)}"
        result = await temporal_client.start_workflow(
            IngestBatchWorkflow.run,
            params,
            id=workflow_id,
            task_queue=request.app.state.settings.temporal_task_queue,
            id_reuse_policy=WorkflowIDReusePolicy.ALLOW_DUPLICATE,
        )

    return IngestResponse(
        workflow_id=result.id if hasattr(result, "id") else result,
        accepted=len(body.records),
    )

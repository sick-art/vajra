"""File upload endpoint — accepts PDF/TXT/MD, extracts text, chunks, and ingests."""

import hashlib
import uuid

from fastapi import APIRouter, HTTPException, Request, UploadFile

from sqlalchemy import select

from vectorhouse.models.db import Collection
from vectorhouse.services.chunking import chunk_text
from vectorhouse.services.file_extract import extract_text

router = APIRouter(prefix="/ingest", tags=["ingest"])


@router.post("/{collection}/upload")
async def upload_file(
    collection: str,
    file: UploadFile,
    request: Request,
    store_type: str = "chroma",
    chunk_strategy: str = "fixed_size",
    chunk_size: int = 512,
    chunk_overlap: int = 50,
):
    """Upload a file (PDF, TXT, MD), extract text, chunk, and start ingest workflow."""
    if not file.filename:
        raise HTTPException(status_code=422, detail="Missing filename")

    # Read file content
    content = await file.read()
    if not content:
        raise HTTPException(status_code=422, detail="Empty file")

    # Extract text
    try:
        text = extract_text(file.filename, content)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    if not text.strip():
        raise HTTPException(status_code=422, detail="No text could be extracted from file")

    # Look up collection
    async with request.app.state.db() as session:
        result = await session.execute(select(Collection).where(Collection.name == collection))
        coll = result.scalar_one_or_none()
        if not coll:
            raise HTTPException(status_code=404, detail=f"Collection '{collection}' not found")

    if coll.store_type != store_type:
        raise HTTPException(
            status_code=400,
            detail=f"Collection '{collection}' uses store_type '{coll.store_type}', "
            f"but request specifies '{store_type}'",
        )

    # Chunk text
    chunks = chunk_text(
        text,
        {"strategy": chunk_strategy, "chunk_size": chunk_size, "chunk_overlap": chunk_overlap},
    )

    if not chunks:
        raise HTTPException(status_code=422, detail="Chunking produced no output")

    # Build records
    source = file.filename
    records = []
    for i, chunk in enumerate(chunks):
        chunk_hash = hashlib.md5(chunk.encode()).hexdigest()[:12]
        record_id = f"{source}-{i}-{chunk_hash}"
        records.append(
            {
                "id": record_id,
                "text": chunk,
                "vector": None,
                "metadata": {
                    "source": source,
                    "chunk_index": i,
                    "total_chunks": len(chunks),
                },
            }
        )

    # Start Temporal workflow
    temporal_client = request.app.state.temporal_client
    if not temporal_client:
        raise HTTPException(status_code=503, detail="Temporal client not available")

    from temporalio.common import WorkflowIDReusePolicy

    from vectorhouse.workflows.ingest_batch import IngestBatchParams, IngestBatchWorkflow
    from vectorhouse.workflows.ingest_single import IngestSingleParams, IngestSingleWorkflow

    if len(records) == 1:
        r = records[0]
        params = IngestSingleParams(
            collection=collection,
            store_type=store_type,
            store_name=coll.store_name,
            record_id=r["id"],
            text=r["text"],
            vector=None,
            metadata=r["metadata"],
            dimensions=coll.dimensions,
        )
        workflow_id = f"ingest-{collection}-{r['id']}"
        handle = await temporal_client.start_workflow(
            IngestSingleWorkflow.run,
            params,
            id=workflow_id,
            task_queue=request.app.state.settings.temporal_task_queue,
            id_reuse_policy=WorkflowIDReusePolicy.ALLOW_DUPLICATE,
        )
    else:
        params = IngestBatchParams(
            collection=collection,
            store_type=store_type,
            store_name=coll.store_name,
            records=records,
            dimensions=coll.dimensions,
        )
        workflow_id = f"upload-{collection}-{source}-{len(records)}-{uuid.uuid4().hex[:8]}"
        handle = await temporal_client.start_workflow(
            IngestBatchWorkflow.run,
            params,
            id=workflow_id,
            task_queue=request.app.state.settings.temporal_task_queue,
            id_reuse_policy=WorkflowIDReusePolicy.ALLOW_DUPLICATE,
        )

    return {
        "workflow_id": handle.id if hasattr(handle, "id") else handle,
        "accepted": len(records),
        "chunks": len(chunks),
        "extracted_chars": len(text),
        "source": source,
        "status": "started",
    }

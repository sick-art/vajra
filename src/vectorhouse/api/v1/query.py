import time

from fastapi import APIRouter, HTTPException, Request
from sqlalchemy import select

from vectorhouse.models.db import Collection
from vectorhouse.schemas.query import QueryRequest, QueryResponse

router = APIRouter(prefix="/query", tags=["query"])


@router.post("/{collection}", response_model=QueryResponse)
async def query_collection(collection: str, body: QueryRequest, request: Request):
    start = time.monotonic()
    query_service = request.app.state.query_service

    # Look up the collection to determine the store
    async with request.app.state.db() as session:
        result = await session.execute(select(Collection).where(Collection.name == collection))
        coll = result.scalar_one_or_none()
        if not coll:
            raise HTTPException(status_code=404, detail=f"Collection '{collection}' not found")

    response = await query_service.execute(
        query_text=body.query_text,
        vector=body.vector,
        top_k=body.top_k,
        filter_=body.filter,
        store_types=[coll.store_type],
        search_type=body.search_type,
        collection_store_name=coll.store_name,
        collection=collection,
    )

    elapsed_ms = (time.monotonic() - start) * 1000
    response.latency_ms = round(elapsed_ms, 2)

    # Async audit
    import asyncio

    from vectorhouse.services.audit import AuditEntry

    entry = AuditEntry(
        operation="query",
        collection=collection,
        store_type=coll.store_type,
        record_count=response.total,
        status="success",
        latency_ms=response.latency_ms,
    )
    asyncio.create_task(request.app.state.audit_service.log(entry))

    return response


@router.post("", response_model=QueryResponse)
async def query_federated(body: QueryRequest, request: Request):
    start = time.monotonic()
    query_service = request.app.state.query_service

    if not body.query_text and not body.vector:
        raise HTTPException(
            status_code=422, detail="Either query_text or vector must be provided"
        )

    response = await query_service.execute(
        query_text=body.query_text,
        vector=body.vector,
        top_k=body.top_k,
        filter_=body.filter,
        store_types=body.store_types,
        search_type=body.search_type,
    )

    elapsed_ms = (time.monotonic() - start) * 1000
    response.latency_ms = round(elapsed_ms, 2)

    # Async audit
    import asyncio

    from vectorhouse.services.audit import AuditEntry

    entry = AuditEntry(
        operation="query",
        collection="*",
        store_type=",".join(response.stores_queried),
        record_count=response.total,
        status="success",
        latency_ms=response.latency_ms,
    )
    asyncio.create_task(request.app.state.audit_service.log(entry))

    return response

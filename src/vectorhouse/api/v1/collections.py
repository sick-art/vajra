from fastapi import APIRouter, HTTPException, Request
from sqlalchemy import select

from vectorhouse.models.db import Collection, DataContract
from vectorhouse.schemas.collection import (
    CollectionCreate,
    CollectionInfo,
    CollectionListResponse,
)

router = APIRouter(prefix="/collections", tags=["collections"])


@router.post("", response_model=CollectionInfo, status_code=201)
async def create_collection(body: CollectionCreate, request: Request):
    async with request.app.state.db() as session:
        # Check if collection already exists
        existing = await session.execute(
            select(Collection).where(Collection.name == body.name)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=409, detail=f"Collection '{body.name}' already exists")

        # Create the collection record
        collection = Collection(
            name=body.name,
            store_type=body.store_type,
            store_name=body.store_name,
            dimensions=body.dimensions,
            metadata_schema=body.metadata_schema,
        )
        session.add(collection)
        await session.flush()

        # Create the initial data contract
        contract = DataContract(
            collection_id=collection.id,
            version=1,
            dimensions=body.dimensions,
            required_metadata=body.required_metadata,
            optional_metadata=body.optional_metadata,
            forbidden_metadata=body.forbidden_metadata,
            embedding_model=body.embedding_model,
            is_active=True,
        )
        session.add(contract)
        await session.commit()
        await session.refresh(collection)

    # Create the physical collection in the vector store
    registry = request.app.state.registry
    if registry.has(body.store_type):
        adapter = registry.get(body.store_type)
        # For LanceDB, the table will be created on first upsert.
        # For Chroma, get_or_create_collection handles it.
        # We don't need to explicitly create here since adapters handle it.

    vector_count = 0
    if registry.has(body.store_type):
        adapter = registry.get(body.store_type)
        stats = await adapter.get_collection_stats(body.store_name)
        vector_count = stats.get("count", 0)

    return CollectionInfo(
        id=collection.id,
        name=collection.name,
        store_type=collection.store_type,
        store_name=collection.store_name,
        dimensions=collection.dimensions,
        metadata_schema=collection.metadata_schema,
        created_at=collection.created_at,
        updated_at=collection.updated_at,
        vector_count=vector_count,
    )


@router.get("", response_model=CollectionListResponse)
async def list_collections(request: Request):
    async with request.app.state.db() as session:
        result = await session.execute(select(Collection).order_by(Collection.name))
        collections = result.scalars().all()

    items = []
    registry = request.app.state.registry
    for c in collections:
        vector_count = 0
        if registry.has(c.store_type):
            try:
                adapter = registry.get(c.store_type)
                stats = await adapter.get_collection_stats(c.store_name)
                vector_count = stats.get("count", 0)
            except Exception:
                pass
        items.append(
            CollectionInfo(
                id=c.id,
                name=c.name,
                store_type=c.store_type,
                store_name=c.store_name,
                dimensions=c.dimensions,
                metadata_schema=c.metadata_schema,
                created_at=c.created_at,
                updated_at=c.updated_at,
                vector_count=vector_count,
            )
        )
    return CollectionListResponse(collections=items, total=len(items))


@router.get("/{name}", response_model=CollectionInfo)
async def get_collection(name: str, request: Request):
    async with request.app.state.db() as session:
        result = await session.execute(select(Collection).where(Collection.name == name))
        collection = result.scalar_one_or_none()
        if not collection:
            raise HTTPException(status_code=404, detail=f"Collection '{name}' not found")

    vector_count = 0
    registry = request.app.state.registry
    if registry.has(collection.store_type):
        try:
            adapter = registry.get(collection.store_type)
            stats = await adapter.get_collection_stats(collection.store_name)
            vector_count = stats.get("count", 0)
        except Exception:
            pass

    return CollectionInfo(
        id=collection.id,
        name=collection.name,
        store_type=collection.store_type,
        store_name=collection.store_name,
        dimensions=collection.dimensions,
        metadata_schema=collection.metadata_schema,
        created_at=collection.created_at,
        updated_at=collection.updated_at,
        vector_count=vector_count,
    )


@router.delete("/{name}", status_code=204)
async def delete_collection(name: str, request: Request):
    async with request.app.state.db() as session:
        result = await session.execute(select(Collection).where(Collection.name == name))
        collection = result.scalar_one_or_none()
        if not collection:
            raise HTTPException(status_code=404, detail=f"Collection '{name}' not found")

        # Delete contracts first
        contracts = await session.execute(
            select(DataContract).where(DataContract.collection_id == collection.id)
        )
        for contract in contracts.scalars().all():
            await session.delete(contract)

        await session.delete(collection)
        await session.commit()

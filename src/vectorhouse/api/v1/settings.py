"""Settings API routes: model management, chunking preview."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Request

from vectorhouse.schemas.settings import (
    ChunkPreviewRequest,
    ChunkPreviewResponse,
    ChunkStrategyInfo,
    ModelInfo,
    ModelListResponse,
    ModelSwitchRequest,
)
from vectorhouse.services.chunking import STRATEGY_INFO, chunk_text

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/settings", tags=["settings"])

# Preset model dimensions (model name -> dimensions)
MODEL_DIMENSIONS: dict[str, int] = {
    "sentence-transformers/all-MiniLM-L6-v2": 384,
    "sentence-transformers/all-mpnet-base-v2": 768,
    "sentence-transformers/multi-qa-mpnet-base-dot-v1": 768,
    "BAAI/bge-small-en-v1.5": 384,
    "BAAI/bge-base-en-v1.5": 768,
    "BAAI/bge-large-en-v1.5": 1024,
    "intfloat/e5-small-v2": 384,
    "intfloat/e5-base-v2": 768,
    "intfloat/e5-large-v2": 1024,
    "thenlper/gte-small": 384,
    "thenlper/gte-base": 768,
    "thenlper/gte-large": 1024,
}


@router.get("/models", response_model=ModelListResponse)
async def list_models(request: Request):
    embedding_service = request.app.state.embedding_service
    active_model = embedding_service.model_name

    models = []
    for name, dims in MODEL_DIMENSIONS.items():
        models.append(
            ModelInfo(
                name=name,
                dimensions=dims,
                is_loaded=(name == active_model),
            )
        )

    return ModelListResponse(models=models, active_model=active_model)


@router.post("/models/switch", response_model=ModelInfo)
async def switch_model(request: Request, body: ModelSwitchRequest):
    if body.model_name not in MODEL_DIMENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown model: {body.model_name}. Available: {list(MODEL_DIMENSIONS.keys())}",
        )

    embedding_service = request.app.state.embedding_service
    try:
        embedding_service.load_model(body.model_name)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load model: {e}")

    return ModelInfo(
        name=body.model_name,
        dimensions=MODEL_DIMENSIONS[body.model_name],
        is_loaded=True,
    )


@router.get("/chunking/strategies", response_model=list[ChunkStrategyInfo])
async def list_chunking_strategies():
    return [ChunkStrategyInfo(**s) for s in STRATEGY_INFO]


@router.post("/chunking/preview", response_model=ChunkPreviewResponse)
async def preview_chunking(request: Request, body: ChunkPreviewRequest):
    chunks = chunk_text(body.text, body.config)
    return ChunkPreviewResponse(
        chunks=chunks,
        chunk_count=len(chunks),
        total_chars=sum(len(c) for c in chunks),
    )

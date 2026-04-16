from pydantic import BaseModel


class ModelInfo(BaseModel):
    name: str
    dimensions: int
    is_loaded: bool


class ModelListResponse(BaseModel):
    models: list[ModelInfo]
    active_model: str


class ModelSwitchRequest(BaseModel):
    model_name: str


class ChunkStrategyInfo(BaseModel):
    id: str
    name: str
    description: str


class ChunkPreviewRequest(BaseModel):
    text: str
    config: dict = {}


class ChunkPreviewResponse(BaseModel):
    chunks: list[str]
    chunk_count: int
    total_chars: int

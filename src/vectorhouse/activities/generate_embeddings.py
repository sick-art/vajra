from temporalio import activity

from vectorhouse.services.embedding import EmbeddingService

# Module-level singleton — loaded once per worker process
_model: EmbeddingService | None = None


def _get_model() -> EmbeddingService:
    global _model
    if _model is None:
        from vectorhouse.config import settings

        _model = EmbeddingService(settings.embedding_model_name)
    return _model


@activity.defn
async def generate_embedding(text: str) -> list[float]:
    """Generate an embedding vector from text using MiniLM."""
    model = _get_model()
    return model.encode_single(text)


@activity.defn
async def generate_embeddings(texts: list[str]) -> list[list[float]]:
    """Generate embedding vectors for a batch of texts."""
    model = _get_model()
    return model.encode(texts)

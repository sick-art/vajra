from __future__ import annotations

import logging
from typing import Any

from sentence_transformers import SentenceTransformer

logger = logging.getLogger(__name__)


class EmbeddingService:
    def __init__(self, model_name: str) -> None:
        self.model_name = model_name
        self._models: dict[str, SentenceTransformer] = {}
        self._models[model_name] = SentenceTransformer(model_name)

    @property
    def model(self) -> SentenceTransformer:
        return self._models[self.model_name]

    def load_model(self, model_name: str) -> None:
        """Load a new model, caching it for reuse."""
        if model_name not in self._models:
            logger.info("Loading embedding model: %s", model_name)
            self._models[model_name] = SentenceTransformer(model_name)
            logger.info("Model loaded: %s", model_name)
        self.model_name = model_name

    def encode(self, texts: list[str], model_name: str | None = None) -> list[list[float]]:
        model = self._get_model(model_name)
        return model.encode(texts, normalize_embeddings=True, show_progress_bar=False).tolist()

    def encode_single(self, text: str, model_name: str | None = None) -> list[float]:
        model = self._get_model(model_name)
        return model.encode(text, normalize_embeddings=True, show_progress_bar=False).tolist()

    def list_available_models(self) -> list[dict[str, Any]]:
        """Return list of loaded models."""
        return [
            {"name": name, "loaded": True}
            for name in self._models
        ]

    def _get_model(self, model_name: str | None = None) -> SentenceTransformer:
        name = model_name or self.model_name
        if name not in self._models:
            self._models[name] = SentenceTransformer(name)
        return self._models[name]

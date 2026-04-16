from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Server
    app_host: str = "0.0.0.0"
    app_port: int = 8000

    # PostgreSQL
    postgres_url: str = "postgresql+asyncpg://vectorhouse:vectorhouse@localhost:5432/vectorhouse"
    postgres_sync_url: str = "postgresql://vectorhouse:vectorhouse@localhost:5432/vectorhouse"

    # Temporal
    temporal_host: str = "localhost:7233"
    temporal_namespace: str = "default"
    temporal_task_queue: str = "vectorhouse-ingest"

    # LanceDB
    lancedb_path: str = "./data/lancedb"

    # Chroma
    chroma_host: str = "localhost"
    chroma_port: int = 8001

    # Embedding
    embedding_model_name: str = "sentence-transformers/all-MiniLM-L6-v2"
    embedding_dimensions: int = 384

    # Dedup
    dedup_similarity_threshold: float = 0.98

    model_config = {"env_prefix": "VH_", "env_file": ".env"}


settings = Settings()

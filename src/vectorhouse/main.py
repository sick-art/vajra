import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from vectorhouse.adapters.chroma_adapter import ChromaAdapter
from vectorhouse.adapters.lancedb_adapter import LanceDBAdapter
from vectorhouse.adapters.registry import AdapterRegistry
from vectorhouse.api.v1.router import v1_router
from vectorhouse.config import settings
from vectorhouse.services.audit import AuditService
from vectorhouse.services.embedding import EmbeddingService
from vectorhouse.services.eval_service import EvalService
from vectorhouse.services.federation import FederationService
from vectorhouse.services.query_service import QueryService

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- Startup ---
    # 1. Database
    engine = create_async_engine(settings.postgres_url, echo=False)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    # 2. Embedding service
    logger.info("Loading embedding model: %s", settings.embedding_model_name)
    embedding_service = EmbeddingService(settings.embedding_model_name)
    logger.info("Embedding model loaded (%d dimensions)", settings.embedding_dimensions)

    # 3. Adapter registry
    registry = AdapterRegistry()
    registry.register("lancedb", LanceDBAdapter(settings.lancedb_path))
    registry.register("chroma", ChromaAdapter(settings.chroma_host, settings.chroma_port))
    logger.info("Registered adapters: %s", list(registry.get_all().keys()))

    # 4. Temporal client (optional — queries work without it)
    temporal_client = None
    try:
        import temporalio.client

        temporal_client = await temporalio.client.Client.connect(
            settings.temporal_host,
            namespace=settings.temporal_namespace,
        )
        logger.info("Connected to Temporal at %s", settings.temporal_host)
    except Exception as e:
        logger.warning("Could not connect to Temporal: %s. Ingestion will be unavailable.", e)

    # 5. Services
    federation_service = FederationService(registry)
    audit_service = AuditService(session_factory)
    query_service = QueryService(
        federation_service=federation_service,
        embedding_service=embedding_service,
        audit_service=audit_service,
    )
    eval_service = EvalService(session_factory=session_factory, query_service=query_service)

    # 6. Store on app.state
    app.state.db = session_factory
    app.state.engine = engine
    app.state.temporal_client = temporal_client
    app.state.embedding_service = embedding_service
    app.state.registry = registry
    app.state.query_service = query_service
    app.state.audit_service = audit_service
    app.state.eval_service = eval_service
    app.state.settings = settings

    yield

    # --- Shutdown ---
    if temporal_client:
        await temporal_client.close()
    await engine.dispose()


def create_app() -> FastAPI:
    app = FastAPI(
        title="VectorHouse",
        description="Data virtualization and governance platform for vector databases",
        version="0.1.0",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(v1_router)
    return app


app = create_app()

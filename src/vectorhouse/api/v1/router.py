from fastapi import APIRouter

from vectorhouse.api.v1.collections import router as collections_router
from vectorhouse.api.v1.eval import router as eval_router
from vectorhouse.api.v1.health import router as health_router
from vectorhouse.api.v1.ingest import router as ingest_router
from vectorhouse.api.v1.query import router as query_router
from vectorhouse.api.v1.settings import router as settings_router
from vectorhouse.api.v1.upload import router as upload_router
from vectorhouse.api.v1.workflows import router as workflows_router

v1_router = APIRouter(prefix="/v1")
v1_router.include_router(health_router)
v1_router.include_router(collections_router)
v1_router.include_router(ingest_router)
v1_router.include_router(upload_router)
v1_router.include_router(query_router)
v1_router.include_router(workflows_router)
v1_router.include_router(eval_router)
v1_router.include_router(settings_router)

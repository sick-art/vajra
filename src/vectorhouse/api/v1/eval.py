"""Evaluation API routes: datasets, runs, results."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Query, Request

from vectorhouse.schemas.eval import (
    DatasetCreate,
    DatasetDetailOut,
    DatasetOut,
    ResultOut,
    RunCreate,
    RunDetailOut,
    RunOut,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/eval", tags=["evaluation"])


# --- Datasets ---


@router.post("/datasets", response_model=DatasetDetailOut, status_code=201)
async def create_dataset(request: Request, body: DatasetCreate):
    svc = request.app.state.eval_service
    result = await svc.create_dataset(
        name=body.name,
        collection=body.collection,
        description=body.description,
        queries=[q.model_dump() for q in body.queries],
    )
    return result


@router.get("/datasets", response_model=list[DatasetOut])
async def list_datasets(request: Request):
    svc = request.app.state.eval_service
    return await svc.list_datasets()


@router.get("/datasets/{dataset_id}", response_model=DatasetDetailOut)
async def get_dataset(request: Request, dataset_id: str):
    svc = request.app.state.eval_service
    result = await svc.get_dataset(dataset_id)
    if not result:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return result


@router.delete("/datasets/{dataset_id}", status_code=204)
async def delete_dataset(request: Request, dataset_id: str):
    svc = request.app.state.eval_service
    deleted = await svc.delete_dataset(dataset_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Dataset not found")


# --- Runs ---


@router.post("/runs", response_model=RunOut, status_code=201)
async def create_run(request: Request, body: RunCreate):
    svc = request.app.state.eval_service
    return await svc.create_run(
        dataset_id=str(body.dataset_id),
        name=body.name,
        store_type=body.store_type,
        embedding_model=body.embedding_model,
        top_k=body.top_k,
        search_type=body.search_type,
    )


@router.post("/runs/{run_id}/execute", response_model=RunDetailOut)
async def execute_run(request: Request, run_id: str):
    svc = request.app.state.eval_service
    try:
        return await svc.execute_run(run_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.exception("Eval run failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Evaluation failed: {e}")


@router.get("/runs", response_model=list[RunOut])
async def list_runs(request: Request, dataset_id: str | None = Query(None)):
    svc = request.app.state.eval_service
    return await svc.list_runs(dataset_id=dataset_id)


@router.get("/runs/{run_id}", response_model=RunDetailOut)
async def get_run(request: Request, run_id: str):
    svc = request.app.state.eval_service
    result = await svc.get_run(run_id)
    if not result:
        raise HTTPException(status_code=404, detail="Run not found")
    return result


@router.get("/runs/{run_id}/results", response_model=list[ResultOut])
async def get_run_results(request: Request, run_id: str):
    svc = request.app.state.eval_service
    return await svc.get_run_results(run_id)

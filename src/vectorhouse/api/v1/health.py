from fastapi import APIRouter, Request

router = APIRouter(tags=["health"])


@router.get("/health")
async def health_check(request: Request):
    registry = request.app.state.registry
    results = {}
    overall = "ok"

    for store_type, adapter in registry.get_all().items():
        status = await adapter.health()
        results[store_type] = status
        if status.get("status") != "ok":
            overall = "degraded"

    # Check DB connectivity
    try:
        async with request.app.state.db() as session:
            await session.execute("SELECT 1")
        results["postgres"] = {"status": "ok"}
    except Exception as e:
        results["postgres"] = {"status": "unhealthy", "detail": str(e)}
        overall = "degraded"

    # Check Temporal connectivity
    try:
        temporal_client = request.app.state.temporal_client
        if temporal_client:
            results["temporal"] = {"status": "ok"}
        else:
            results["temporal"] = {"status": "not_configured"}
    except Exception as e:
        results["temporal"] = {"status": "unhealthy", "detail": str(e)}
        overall = "degraded"

    return {"status": overall, "components": results}

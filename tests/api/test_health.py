import pytest


@pytest.mark.asyncio
async def test_health_check(client):
    response = await client.get("/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] in ("ok", "degraded")
    assert "components" in data
    assert "lancedb" in data["components"]
    assert "chroma" in data["components"]

import pytest


@pytest.mark.asyncio
async def test_query_requires_text_or_vector(client):
    response = await client.post(
        "/v1/query",
        json={"top_k": 5},
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_query_with_vector(client):
    response = await client.post(
        "/v1/query",
        json={
            "vector": [0.1] * 384,
            "top_k": 5,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert "results" in data
    assert "latency_ms" in data
    assert "stores_queried" in data


@pytest.mark.asyncio
async def test_query_collection_not_found(client):
    response = await client.post(
        "/v1/query/nonexistent",
        json={"query_text": "test"},
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_query_collection_with_text(client):
    # Create a collection first
    await client.post(
        "/v1/collections",
        json={"name": "query-test", "store_type": "lancedb", "store_name": "query_table"},
    )
    response = await client.post(
        "/v1/query/query-test",
        json={"query_text": "hello world", "top_k": 5},
    )
    assert response.status_code == 200
    data = response.json()
    assert "results" in data

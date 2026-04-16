import pytest


@pytest.mark.asyncio
async def test_create_collection(client):
    response = await client.post(
        "/v1/collections",
        json={
            "name": "test-collection",
            "store_type": "lancedb",
            "store_name": "test_table",
            "dimensions": 384,
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "test-collection"
    assert data["store_type"] == "lancedb"
    assert data["dimensions"] == 384


@pytest.mark.asyncio
async def test_create_collection_duplicate(client):
    await client.post(
        "/v1/collections",
        json={"name": "dup-test", "store_type": "lancedb", "store_name": "dup_table"},
    )
    response = await client.post(
        "/v1/collections",
        json={"name": "dup-test", "store_type": "lancedb", "store_name": "dup_table"},
    )
    assert response.status_code == 409


@pytest.mark.asyncio
async def test_list_collections(client):
    await client.post(
        "/v1/collections",
        json={"name": "list-test-1", "store_type": "lancedb", "store_name": "t1"},
    )
    await client.post(
        "/v1/collections",
        json={"name": "list-test-2", "store_type": "chroma", "store_name": "t2"},
    )
    response = await client.get("/v1/collections")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 2
    names = [c["name"] for c in data["collections"]]
    assert "list-test-1" in names
    assert "list-test-2" in names


@pytest.mark.asyncio
async def test_get_collection(client):
    await client.post(
        "/v1/collections",
        json={"name": "get-test", "store_type": "lancedb", "store_name": "get_table"},
    )
    response = await client.get("/v1/collections/get-test")
    assert response.status_code == 200
    assert response.json()["name"] == "get-test"


@pytest.mark.asyncio
async def test_get_collection_not_found(client):
    response = await client.get("/v1/collections/nonexistent")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_delete_collection(client):
    await client.post(
        "/v1/collections",
        json={"name": "delete-test", "store_type": "chroma", "store_name": "del_table"},
    )
    response = await client.delete("/v1/collections/delete-test")
    assert response.status_code == 204

    # Verify it's gone
    response = await client.get("/v1/collections/delete-test")
    assert response.status_code == 404

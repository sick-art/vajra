import pytest


@pytest.mark.asyncio
async def test_ingest_collection_not_found(client):
    response = await client.post(
        "/v1/ingest/nonexistent",
        json={
            "records": [{"id": "1", "text": "test"}],
            "store_type": "lancedb",
        },
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_ingest_requires_text_or_vector(client):
    await client.post(
        "/v1/collections",
        json={"name": "ingest-test", "store_type": "lancedb", "store_name": "ingest_table"},
    )
    response = await client.post(
        "/v1/ingest/ingest-test",
        json={
            "records": [{"id": "1"}],  # No text or vector
            "store_type": "lancedb",
        },
    )
    assert response.status_code == 422

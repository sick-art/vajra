"""Integration test: upload a PDF via the /upload endpoint and verify vector search works.

Requires running Docker services (Temporal, Chroma, Postgres).
"""

import os
import time

import httpx
import pytest

API_BASE = "http://localhost:8000/v1"
PDF_PATH = r"C:\Users\gudur\Downloads\Financial+analysis+in+lending+to+business.pdf"
COLLECTION = "test-pdf-upload-v2"
STORE_TYPE = "chroma"


@pytest.fixture(scope="module", autouse=True)
def skip_if_no_services():
    """Skip the entire module if Docker services are not running."""
    try:
        resp = httpx.get(f"{API_BASE}/health", timeout=5)
        if resp.status_code != 200:
            pytest.skip("VectorHouse API not reachable")
    except httpx.ConnectError:
        pytest.skip("VectorHouse API not reachable (Docker not running?)")


@pytest.fixture(scope="module", autouse=True)
def ensure_collection():
    """Create the test collection if it doesn't exist, clean up after."""
    client = httpx.Client(base_url=API_BASE, timeout=10)

    # Create collection (ignore 409 if exists)
    resp = client.post(
        "/collections",
        json={
            "name": COLLECTION,
            "store_type": STORE_TYPE,
            "store_name": COLLECTION,
            "dimensions": 384,
        },
    )
    assert resp.status_code in (200, 201, 409), f"Failed to create collection: {resp.text}"

    yield

    # Cleanup
    client.delete(f"/collections/{COLLECTION}")
    client.close()


def test_upload_pdf_and_query():
    """Upload a PDF, wait for ingestion, then query Chroma for content."""
    if not os.path.exists(PDF_PATH):
        pytest.skip("Test PDF not found on disk")

    client = httpx.Client(base_url=API_BASE, timeout=30)

    # 1. Upload the PDF
    with open(PDF_PATH, "rb") as f:
        resp = client.post(
            f"/ingest/{COLLECTION}/upload",
            params={"store_type": STORE_TYPE, "chunk_strategy": "fixed_size", "chunk_size": 2000, "chunk_overlap": 100},
            files={"file": (os.path.basename(PDF_PATH), f, "application/pdf")},
        )

    assert resp.status_code == 200, f"Upload failed: {resp.text}"
    data = resp.json()
    assert data["accepted"] > 0, "No records were created from PDF"
    assert data["extracted_chars"] > 100, "Not enough text extracted from PDF"
    workflow_id = data["workflow_id"]

    # 2. Wait for workflow to complete (poll Temporal via workflows API)
    deadline = time.time() + 120  # 2 minutes max
    status = "RUNNING"
    while time.time() < deadline and status == "RUNNING":
        time.sleep(3)
        wf_resp = client.get(f"/workflows/{workflow_id}")
        if wf_resp.status_code == 200:
            status = wf_resp.json().get("status", "RUNNING")

    assert status == "COMPLETED", f"Workflow did not complete in time, status: {status}"

    # 3. Query the collection for finance-related content
    query_resp = client.post(
        f"/query/{COLLECTION}",
        json={"query_text": "financial analysis lending business credit risk", "top_k": 5},
    )
    assert query_resp.status_code == 200, f"Query failed: {query_resp.text}"

    results = query_resp.json().get("results", [])
    assert len(results) > 0, "No results returned from vector search"

    # Verify the results contain text from the PDF, not the placeholder
    for r in results:
        text = r.get("text", "")
        assert "[Binary file:" not in text, "Result contains placeholder text instead of extracted PDF content"
        assert len(text) > 10, "Result text is too short to be real content"

    client.close()

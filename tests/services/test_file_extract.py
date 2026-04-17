"""Tests for PDF and text file extraction."""

import pytest

from vectorhouse.services.file_extract import extract_text


def test_extract_txt():
    content = b"Hello world\nLine two"
    result = extract_text("readme.txt", content)
    assert result == "Hello world\nLine two"


def test_extract_md():
    content = b"# Title\n\nSome markdown content"
    result = extract_text("doc.md", content)
    assert "# Title" in result


def test_extract_unsupported():
    with pytest.raises(ValueError, match="Unsupported file type"):
        extract_text("image.png", b"fake content")


def test_extract_pdf_real_file():
    """Extract text from the real PDF on disk."""
    import os

    pdf_path = r"C:\Users\gudur\Downloads\Financial+analysis+in+lending+to+business.pdf"
    if not os.path.exists(pdf_path):
        pytest.skip("Test PDF not found on disk")

    with open(pdf_path, "rb") as f:
        content = f.read()

    text = extract_text("Financial+analysis+in+lending+to+business.pdf", content)

    assert len(text) > 100, f"Expected substantial text, got {len(text)} chars"
    # The PDF is about financial analysis — check for some expected keywords
    lower = text.lower()
    assert any(
        kw in lower for kw in ("financial", "lending", "business", "analysis", "credit", "loan")
    ), f"Expected finance-related keywords in extracted text, got: {text[:200]}"

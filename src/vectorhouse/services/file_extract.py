"""Extract text from uploaded files (PDF, TXT, MD, DOCX)."""

from __future__ import annotations

import io


def extract_text(filename: str, content: bytes) -> str:
    """Return plain text from file bytes based on file extension."""
    lower = filename.lower()

    if lower.endswith((".txt", ".md")):
        return content.decode("utf-8", errors="replace")

    if lower.endswith(".pdf"):
        return _extract_pdf(content)

    raise ValueError(f"Unsupported file type: {filename}")


def _extract_pdf(data: bytes) -> str:
    """Extract text from PDF bytes using pdfplumber."""
    import pdfplumber

    pages: list[str] = []
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if text:
                pages.append(text)

    if not pages:
        raise ValueError("PDF contains no extractable text (may be image-only)")

    return "\n\n".join(pages)

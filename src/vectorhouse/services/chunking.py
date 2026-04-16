"""Chunking strategies for text splitting."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class ChunkingStrategy(str, Enum):
    NONE = "none"
    FIXED_SIZE = "fixed_size"
    SENTENCE = "sentence"
    PARAGRAPH = "paragraph"
    RECURSIVE = "recursive"


@dataclass
class ChunkConfig:
    strategy: ChunkingStrategy = ChunkingStrategy.NONE
    chunk_size: int = 512
    chunk_overlap: int = 50
    separator: str | None = None


STRATEGY_INFO: list[dict[str, str]] = [
    {"id": "none", "name": "None", "description": "No chunking — text is kept as-is"},
    {"id": "fixed_size", "name": "Fixed Size", "description": "Split into fixed-size character chunks with overlap"},
    {"id": "sentence", "name": "Sentence", "description": "Split on sentence boundaries (.!?)"},
    {"id": "paragraph", "name": "Paragraph", "description": "Split on double newlines"},
    {"id": "recursive", "name": "Recursive", "description": "Recursive character splitting with multiple separators"},
]


def chunk_text(text: str, config: dict[str, Any] | ChunkConfig | None = None) -> list[str]:
    """Split text into chunks according to the given strategy.

    Args:
        text: The input text to chunk.
        config: ChunkConfig instance or dict with keys: strategy, chunk_size, chunk_overlap, separator.

    Returns:
        List of text chunks.
    """
    if config is None:
        cfg = ChunkConfig()
    elif isinstance(config, dict):
        strategy_str = config.get("strategy", "none")
        cfg = ChunkConfig(
            strategy=ChunkingStrategy(strategy_str),
            chunk_size=int(config.get("chunk_size", 512)),
            chunk_overlap=int(config.get("chunk_overlap", 50)),
            separator=config.get("separator"),
        )
    else:
        cfg = config

    if cfg.strategy == ChunkingStrategy.NONE or not text:
        return [text] if text else []

    if cfg.strategy == ChunkingStrategy.FIXED_SIZE:
        return _fixed_size_chunk(text, cfg.chunk_size, cfg.chunk_overlap)

    if cfg.strategy == ChunkingStrategy.SENTENCE:
        return _sentence_chunk(text, cfg.chunk_size, cfg.chunk_overlap)

    if cfg.strategy == ChunkingStrategy.PARAGRAPH:
        return _paragraph_chunk(text, cfg.chunk_size, cfg.chunk_overlap)

    if cfg.strategy == ChunkingStrategy.RECURSIVE:
        return _recursive_chunk(text, cfg.chunk_size, cfg.chunk_overlap)

    return [text]


def _fixed_size_chunk(text: str, size: int, overlap: int) -> list[str]:
    """Split text into fixed-size character windows with overlap."""
    if len(text) <= size:
        return [text]

    chunks = []
    start = 0
    while start < len(text):
        end = start + size
        chunks.append(text[start:end])
        start += size - overlap
        if start >= len(text):
            break
    return chunks


def _sentence_chunk(text: str, max_size: int, overlap: int) -> list[str]:
    """Split text on sentence boundaries, merging short sentences up to max_size."""
    sentences = re.split(r"(?<=[.!?])\s+", text)
    return _merge_chunks(sentences, max_size, " ")


def _paragraph_chunk(text: str, max_size: int, overlap: int) -> list[str]:
    """Split on double newlines, merging short paragraphs up to max_size."""
    paragraphs = re.split(r"\n\s*\n", text)
    return _merge_chunks(paragraphs, max_size, "\n\n")


def _recursive_chunk(text: str, size: int, overlap: int) -> list[str]:
    """Recursive character splitting trying multiple separators."""
    separators = ["\n\n", "\n", ". ", " ", ""]

    def _split(text: str, separators: list[str], size: int) -> list[str]:
        if len(text) <= size or not separators:
            return [text]

        sep = separators[0]
        remaining = separators[1:]

        if not sep:
            # Last resort: fixed-size split
            return _fixed_size_chunk(text, size, overlap)

        parts = text.split(sep)
        chunks: list[str] = []
        current = ""

        for part in parts:
            candidate = current + sep + part if current else part
            if len(candidate) <= size:
                current = candidate
            else:
                if current:
                    chunks.append(current)
                if len(part) > size:
                    chunks.extend(_split(part, remaining, size))
                    current = ""
                else:
                    current = part

        if current:
            chunks.append(current)

        return chunks

    return _split(text, separators, size)


def _merge_chunks(pieces: list[str], max_size: int, joiner: str) -> list[str]:
    """Merge short pieces up to max_size."""
    chunks: list[str] = []
    current = ""

    for piece in pieces:
        candidate = current + joiner + piece if current else piece
        if len(candidate) <= max_size:
            current = candidate
        else:
            if current:
                chunks.append(current)
            current = piece

    if current:
        chunks.append(current)

    return chunks

import uuid
from typing import Any

from temporalio import activity


@activity.defn
async def audit_log(
    operation: str,
    collection: str,
    status: str,
    store_type: str | None = None,
    record_count: int | None = None,
    principal: str | None = None,
    error_message: str | None = None,
    latency_ms: float | None = None,
    metadata: dict[str, Any] | None = None,
) -> str:
    """Write an audit log entry to PostgreSQL (guaranteed by Temporal)."""
    from sqlalchemy import insert

    from vectorhouse.config import settings
    from vectorhouse.models.db import AuditLog

    # Use sync-style connection for the activity
    import asyncpg

    conn = await asyncpg.connect(
        settings.postgres_url.replace("+asyncpg", "")
    )
    try:
        await conn.execute(
            """
            INSERT INTO audit_log (id, operation, collection, store_type, record_count,
                                   principal, status, error_message, latency_ms, metadata_)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
            """,
            uuid.uuid4(),
            operation,
            collection,
            store_type,
            record_count,
            principal,
            status,
            error_message,
            latency_ms,
            __import__("json").dumps(metadata or {}),
        )
    finally:
        await conn.close()

    return "ok"

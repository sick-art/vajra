import uuid
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import insert

from vectorhouse.models.db import AuditLog


@dataclass
class AuditEntry:
    operation: str
    collection: str
    status: str = "success"
    store_type: str | None = None
    record_count: int | None = None
    principal: str | None = None
    error_message: str | None = None
    latency_ms: float | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


class AuditService:
    def __init__(self, session_factory) -> None:
        self.session_factory = session_factory

    async def log(self, entry: AuditEntry) -> None:
        async with self.session_factory() as session:
            await session.execute(
                insert(AuditLog).values(
                    id=uuid.uuid4(),
                    operation=entry.operation,
                    collection=entry.collection,
                    store_type=entry.store_type,
                    record_count=entry.record_count,
                    principal=entry.principal,
                    status=entry.status,
                    error_message=entry.error_message,
                    latency_ms=entry.latency_ms,
                    metadata_=entry.metadata,
                )
            )
            await session.commit()

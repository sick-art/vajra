import uuid

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Collection(Base):
    __tablename__ = "collections"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    store_type: Mapped[str] = mapped_column(String(50), nullable=False)
    store_name: Mapped[str] = mapped_column(String(255), nullable=False)
    dimensions: Mapped[int] = mapped_column(Integer, nullable=False, default=384)
    metadata_schema: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    contracts: Mapped[list["DataContract"]] = relationship(back_populates="collection")


class DataContract(Base):
    __tablename__ = "data_contracts"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    collection_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("collections.id"))
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    dimensions: Mapped[int] = mapped_column(Integer, nullable=False, default=384)
    required_metadata: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    optional_metadata: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    forbidden_metadata: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    embedding_model: Mapped[str | None] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at = mapped_column(DateTime(timezone=True), server_default=func.now())

    collection: Mapped["Collection"] = relationship(back_populates="contracts")


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    operation: Mapped[str] = mapped_column(String(20), nullable=False)
    collection: Mapped[str] = mapped_column(String(255), nullable=False)
    store_type: Mapped[str | None] = mapped_column(String(50))
    record_count: Mapped[int | None] = mapped_column(Integer)
    principal: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text)
    latency_ms: Mapped[float | None] = mapped_column(Float)
    metadata_: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at = mapped_column(DateTime(timezone=True), server_default=func.now())

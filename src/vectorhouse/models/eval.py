import uuid

from sqlalchemy import ARRAY, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy import JSON, Boolean, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from vectorhouse.models.db import Base


class EvalDataset(Base):
    __tablename__ = "eval_datasets"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    collection: Mapped[str] = mapped_column(String(255), nullable=False)
    query_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at = mapped_column(DateTime(timezone=True), server_default=func.now())

    queries: Mapped[list["EvalQuery"]] = relationship(back_populates="dataset", cascade="all, delete-orphan")
    runs: Mapped[list["EvalRun"]] = relationship(back_populates="dataset", cascade="all, delete-orphan")


class EvalQuery(Base):
    __tablename__ = "eval_queries"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    dataset_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("eval_datasets.id", ondelete="CASCADE"))
    query_text: Mapped[str] = mapped_column(Text, nullable=False)
    relevant_ids: Mapped[list] = mapped_column(ARRAY(String), nullable=False, default=list)
    relevance_scores: Mapped[list] = mapped_column(ARRAY(Float), nullable=False, default=list)
    metadata_: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict, name="metadata")
    created_at = mapped_column(DateTime(timezone=True), server_default=func.now())

    dataset: Mapped["EvalDataset"] = relationship(back_populates="queries")


class EvalRun(Base):
    __tablename__ = "eval_runs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    dataset_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("eval_datasets.id"))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    store_type: Mapped[str | None] = mapped_column(String(50))
    embedding_model: Mapped[str | None] = mapped_column(String(255))
    top_k: Mapped[int] = mapped_column(Integer, nullable=False, default=10)
    search_type: Mapped[str] = mapped_column(String(20), nullable=False, default="dense")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    workflow_id: Mapped[str | None] = mapped_column(String(255))
    created_at = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at = mapped_column(DateTime(timezone=True))

    dataset: Mapped["EvalDataset"] = relationship(back_populates="runs")
    results: Mapped[list["EvalResult"]] = relationship(back_populates="run", cascade="all, delete-orphan")
    run_metrics: Mapped["EvalRunMetrics | None"] = relationship(back_populates="run", cascade="all, delete-orphan", uselist=False)


class EvalResult(Base):
    __tablename__ = "eval_results"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    run_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("eval_runs.id", ondelete="CASCADE"))
    query_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("eval_queries.id"))
    returned_ids: Mapped[list] = mapped_column(ARRAY(String), nullable=False, default=list)
    returned_scores: Mapped[list] = mapped_column(ARRAY(Float), nullable=False, default=list)
    ndcg: Mapped[float | None] = mapped_column(Float)
    recall_at_k: Mapped[float | None] = mapped_column(Float)
    precision_at_k: Mapped[float | None] = mapped_column(Float)
    latency_ms: Mapped[float | None] = mapped_column(Float)
    metadata_: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict, name="metadata")

    run: Mapped["EvalRun"] = relationship(back_populates="results")


class EvalRunMetrics(Base):
    __tablename__ = "eval_run_metrics"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    run_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("eval_runs.id", ondelete="CASCADE"), unique=True)
    avg_ndcg: Mapped[float] = mapped_column(Float, nullable=False)
    avg_recall_at_k: Mapped[float] = mapped_column(Float, nullable=False)
    avg_precision_at_k: Mapped[float] = mapped_column(Float, nullable=False)
    median_ndcg: Mapped[float | None] = mapped_column(Float)
    median_recall_at_k: Mapped[float | None] = mapped_column(Float)
    median_precision_at_k: Mapped[float | None] = mapped_column(Float)
    p95_latency_ms: Mapped[float | None] = mapped_column(Float)
    total_queries: Mapped[int] = mapped_column(Integer, nullable=False)
    metadata_: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict, name="metadata")

    run: Mapped["EvalRun"] = relationship(back_populates="run_metrics")

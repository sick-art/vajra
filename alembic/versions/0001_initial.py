"""initial

Revision ID: 0001
Revises:
Create Date: 2026-04-15

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "collections",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), unique=True, nullable=False),
        sa.Column("store_type", sa.String(50), nullable=False),
        sa.Column("store_name", sa.String(255), nullable=False),
        sa.Column("dimensions", sa.Integer(), nullable=False, server_default="384"),
        sa.Column("metadata_schema", JSONB, nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
        ),
    )

    op.create_table(
        "data_contracts",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("collection_id", UUID(as_uuid=True), sa.ForeignKey("collections.id")),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("dimensions", sa.Integer(), nullable=False, server_default="384"),
        sa.Column("required_metadata", JSONB, nullable=False, server_default="[]"),
        sa.Column("optional_metadata", JSONB, nullable=False, server_default="[]"),
        sa.Column("forbidden_metadata", JSONB, nullable=False, server_default="[]"),
        sa.Column("embedding_model", sa.String(255)),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("collection_id", "version"),
    )

    op.create_table(
        "audit_log",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("operation", sa.String(20), nullable=False),
        sa.Column("collection", sa.String(255), nullable=False),
        sa.Column("store_type", sa.String(50)),
        sa.Column("record_count", sa.Integer()),
        sa.Column("principal", sa.String(255)),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("error_message", sa.Text()),
        sa.Column("latency_ms", sa.Float()),
        sa.Column("metadata_", JSONB, nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("audit_log")
    op.drop_table("data_contracts")
    op.drop_table("collections")

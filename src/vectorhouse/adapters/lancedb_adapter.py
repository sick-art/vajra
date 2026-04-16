from typing import Any

import lancedb
import numpy as np

from vectorhouse.adapters.base import QueryResult, VectorRecord, VectorStoreAdapter


def _build_where_clause(filter: dict[str, Any] | None) -> str | None:
    """Convert a dict filter into a LanceDB SQL where clause."""
    if not filter:
        return None
    parts = []
    for key, value in filter.items():
        if isinstance(value, str):
            parts.append(f"{key} = '{value}'")
        elif isinstance(value, bool):
            parts.append(f"{key} = {str(value).lower()}")
        elif isinstance(value, (int, float)):
            parts.append(f"{key} = {value}")
        elif isinstance(value, list):
            quoted = ", ".join(f"'{v}'" if isinstance(v, str) else str(v) for v in value)
            parts.append(f"{key} IN ({quoted})")
    return " AND ".join(parts) if parts else None


class LanceDBAdapter(VectorStoreAdapter):
    def __init__(self, db_path: str) -> None:
        self._db_path = db_path
        self._db: lancedb.DBConnection | None = None

    def _get_db(self) -> lancedb.DBConnection:
        if self._db is None:
            self._db = lancedb.connect(self._db_path)
        return self._db

    async def upsert(self, collection: str, records: list[VectorRecord]) -> int:
        db = self._get_db()
        data = []
        for r in records:
            row: dict[str, Any] = {
                "id": r.id,
                "vector": r.vector,
                "metadata": r.metadata or {},
            }
            if r.text is not None:
                row["text"] = r.text
            data.append(row)

        try:
            table = db.open_table(collection)
            table.merge_insert("id").when_matched_update_all().when_not_matched_insert_all().execute(data)
        except FileNotFoundError:
            db.create_table(collection, data)

        return len(records)

    async def query(
        self,
        collection: str,
        vector: list[float],
        top_k: int = 10,
        filter: dict[str, Any] | None = None,
    ) -> list[QueryResult]:
        db = self._get_db()
        try:
            table = db.open_table(collection)
        except FileNotFoundError:
            return []

        query_builder = table.search(vector).limit(top_k)
        where = _build_where_clause(filter)
        if where:
            query_builder = query_builder.where(where)

        results = query_builder.to_list()
        return [
            QueryResult(
                id=str(row["id"]),
                score=float(row["_distance"]),
                metadata=row.get("metadata", {}),
                text=row.get("text"),
            )
            for row in results
        ]

    async def hybrid_query(
        self,
        collection: str,
        vector: list[float],
        query_text: str,
        top_k: int = 10,
        filter: dict[str, Any] | None = None,
    ) -> list[QueryResult]:
        # LanceDB hybrid requires a full-text search index.
        # Fall back to dense-only if FTS is not configured.
        db = self._get_db()
        try:
            table = db.open_table(collection)
        except FileNotFoundError:
            return []

        try:
            query_builder = table.search(vector, query_type="hybrid").limit(top_k)
            where = _build_where_clause(filter)
            if where:
                query_builder = query_builder.where(where)
            results = query_builder.to_list()
        except Exception:
            return await self.query(collection, vector, top_k, filter)

        return [
            QueryResult(
                id=str(row["id"]),
                score=float(row.get("_relevance_score", row.get("_distance", 0.0))),
                metadata=row.get("metadata", {}),
                text=row.get("text"),
            )
            for row in results
        ]

    async def delete(self, collection: str, ids: list[str]) -> int:
        db = self._get_db()
        try:
            table = db.open_table(collection)
        except FileNotFoundError:
            return 0
        table.delete(f"id IN ({', '.join(repr(i) for i in ids)})")
        return len(ids)

    async def list_collections(self) -> list[str]:
        db = self._get_db()
        return db.table_names()

    async def health(self) -> dict[str, Any]:
        try:
            db = self._get_db()
            db.table_names()
            return {"status": "ok"}
        except Exception as e:
            return {"status": "unhealthy", "detail": str(e)}

    async def get_collection_stats(self, collection: str) -> dict[str, Any]:
        db = self._get_db()
        try:
            table = db.open_table(collection)
            count = table.count_rows()
            schema = table.schema
            vec_field = None
            for f in schema:
                if f.name == "vector":
                    vec_field = f
                    break
            dims = 0
            if vec_field:
                dims = vec_field.type.list_size if hasattr(vec_field.type, "list_size") else 0
            return {"count": count, "dimensions": dims}
        except FileNotFoundError:
            return {"count": 0, "dimensions": 0}

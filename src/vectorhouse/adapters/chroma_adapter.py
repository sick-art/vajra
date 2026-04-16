from typing import Any

import chromadb

from vectorhouse.adapters.base import QueryResult, VectorRecord, VectorStoreAdapter


class ChromaAdapter(VectorStoreAdapter):
    def __init__(self, host: str, port: int) -> None:
        self._host = host
        self._port = port
        self._client: chromadb.HttpClient | None = None

    def _get_client(self) -> chromadb.HttpClient:
        if self._client is None:
            self._client = chromadb.HttpClient(host=self._host, port=self._port)
        return self._client

    def _get_collection(self, name: str) -> chromadb.Collection:
        client = self._get_client()
        return client.get_or_create_collection(name)

    async def upsert(self, collection: str, records: list[VectorRecord]) -> int:
        coll = self._get_collection(collection)
        ids = [r.id for r in records]
        embeddings = [r.vector for r in records]
        metadatas = [r.metadata or {} for r in records]
        documents = [r.text for r in records if r.text is not None] or None

        # chroma requires metadatas to have string/bool/int/float values
        clean_metadatas = []
        for m in metadatas:
            clean = {}
            for k, v in m.items():
                if isinstance(v, (str, bool, int, float)):
                    clean[k] = v
                else:
                    clean[k] = str(v)
            clean_metadatas.append(clean)

        coll.upsert(
            ids=ids,
            embeddings=embeddings,
            metadatas=clean_metadatas,
            documents=documents,
        )
        return len(records)

    async def query(
        self,
        collection: str,
        vector: list[float],
        top_k: int = 10,
        filter: dict[str, Any] | None = None,
    ) -> list[QueryResult]:
        coll = self._get_collection(collection)
        kwargs: dict[str, Any] = {
            "query_embeddings": [vector],
            "n_results": top_k,
        }
        if filter:
            kwargs["where"] = filter

        results = coll.query(**kwargs)

        if not results["ids"] or not results["ids"][0]:
            return []

        ids = results["ids"][0]
        distances = results["distances"][0] if results.get("distances") else [0.0] * len(ids)
        metadatas = results["metadatas"][0] if results.get("metadatas") else [{}] * len(ids)
        documents = results["documents"][0] if results.get("documents") else [None] * len(ids)

        return [
            QueryResult(
                id=str(id_),
                score=float(dist),
                metadata=meta or {},
                text=doc,
            )
            for id_, dist, meta, doc in zip(ids, distances, metadatas, documents)
        ]

    async def hybrid_query(
        self,
        collection: str,
        vector: list[float],
        query_text: str,
        top_k: int = 10,
        filter: dict[str, Any] | None = None,
    ) -> list[QueryResult]:
        coll = self._get_collection(collection)
        kwargs: dict[str, Any] = {
            "query_embeddings": [vector],
            "n_results": top_k,
        }
        if filter:
            kwargs["where"] = filter
        # Add text content filter alongside embedding search
        kwargs["where_document"] = {"$contains": query_text}

        results = coll.query(**kwargs)

        if not results["ids"] or not results["ids"][0]:
            # Fall back to dense-only if no text match
            return await self.query(collection, vector, top_k, filter)

        ids = results["ids"][0]
        distances = results["distances"][0] if results.get("distances") else [0.0] * len(ids)
        metadatas = results["metadatas"][0] if results.get("metadatas") else [{}] * len(ids)
        documents = results["documents"][0] if results.get("documents") else [None] * len(ids)

        return [
            QueryResult(
                id=str(id_),
                score=float(dist),
                metadata=meta or {},
                text=doc,
            )
            for id_, dist, meta, doc in zip(ids, distances, metadatas, documents)
        ]

    async def delete(self, collection: str, ids: list[str]) -> int:
        coll = self._get_collection(collection)
        coll.delete(ids=ids)
        return len(ids)

    async def list_collections(self) -> list[str]:
        client = self._get_client()
        return [c.name for c in client.list_collections()]

    async def health(self) -> dict[str, Any]:
        try:
            client = self._get_client()
            client.heartbeat()
            return {"status": "ok"}
        except Exception as e:
            return {"status": "unhealthy", "detail": str(e)}

    async def get_collection_stats(self, collection: str) -> dict[str, Any]:
        try:
            coll = self._get_collection(collection)
            count = coll.count()
            return {"count": count, "dimensions": 0}  # chroma doesn't expose dimensions directly
        except Exception:
            return {"count": 0, "dimensions": 0}

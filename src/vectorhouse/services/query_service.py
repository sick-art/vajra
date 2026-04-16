from typing import Any

from vectorhouse.schemas.query import QueryResponse, ScoredResult
from vectorhouse.services.audit import AuditService
from vectorhouse.services.embedding import EmbeddingService
from vectorhouse.services.federation import FederationService


class QueryService:
    def __init__(
        self,
        federation_service: FederationService,
        embedding_service: EmbeddingService,
        audit_service: AuditService,
    ) -> None:
        self.federation = federation_service
        self.embedding = embedding_service
        self.audit = audit_service

    async def execute(
        self,
        query_text: str | None = None,
        vector: list[float] | None = None,
        top_k: int = 10,
        filter_: dict[str, Any] | None = None,
        store_types: list[str] | None = None,
        search_type: str = "dense",
        collection_store_name: str | None = None,
        collection: str | None = None,
    ) -> QueryResponse:
        # Generate embedding if needed
        if vector is None and query_text is not None:
            vector = self.embedding.encode_single(query_text)
        elif vector is None:
            raise ValueError("Either query_text or vector must be provided")

        # Execute federated query
        results: list[ScoredResult] = await self.federation.federated_query(
            vector=vector,
            query_text=query_text,
            top_k=top_k,
            filter=filter_,
            store_types=store_types,
            search_type=search_type,
            collection_store_name=collection_store_name,
        )

        stores_queried = list({r.store_type for r in results}) if results else (store_types or [])

        return QueryResponse(
            results=results,
            total=len(results),
            stores_queried=stores_queried,
            latency_ms=0.0,  # set by caller
        )

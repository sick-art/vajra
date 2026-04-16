"""IR evaluation metrics: NDCG, Recall@K, Precision@K."""

from __future__ import annotations

import math


def _dcg(relevances: list[float], k: int | None = None) -> float:
    """Compute Discounted Cumulative Gain at position k."""
    if k is not None:
        relevances = relevances[:k]
    return sum(
        rel / math.log2(i + 2)  # i is 0-indexed, so position is i+1, discount is log2(i+2)
        for i, rel in enumerate(relevances)
    )


def ndcg(
    returned_ids: list[str],
    relevant_ids: list[str],
    relevance_scores: list[float] | None = None,
    k: int | None = None,
) -> float:
    """Normalized Discounted Cumulative Gain.

    If relevance_scores is None, binary relevance is assumed (1.0 for relevant, 0 otherwise).
    """
    if not relevant_ids:
        return 0.0

    # Build relevance lookup
    if relevance_scores and len(relevance_scores) == len(relevant_ids):
        rel_map = dict(zip(relevant_ids, relevance_scores))
    else:
        rel_map = {rid: 1.0 for rid in relevant_ids}

    # DCG of returned results
    returned_rels = [rel_map.get(rid, 0.0) for rid in returned_ids]
    dcg_val = _dcg(returned_rels, k)

    # Ideal DCG: sort all relevant docs by relevance score descending
    ideal_rels = sorted(rel_map.values(), reverse=True)
    idcg_val = _dcg(ideal_rels, k)

    if idcg_val == 0:
        return 0.0

    return dcg_val / idcg_val


def recall_at_k(
    returned_ids: list[str],
    relevant_ids: list[str],
    k: int,
) -> float:
    """Recall@K: fraction of relevant documents retrieved in top-k."""
    if not relevant_ids:
        return 0.0

    returned_set = set(returned_ids[:k])
    relevant_set = set(relevant_ids)
    hits = len(returned_set & relevant_set)
    return hits / len(relevant_set)


def precision_at_k(
    returned_ids: list[str],
    relevant_ids: list[str],
    k: int,
) -> float:
    """Precision@K: fraction of retrieved documents that are relevant."""
    if k == 0:
        return 0.0

    returned_slice = returned_ids[:k]
    relevant_set = set(relevant_ids)
    hits = sum(1 for rid in returned_slice if rid in relevant_set)
    return hits / k


def average_precision(
    returned_ids: list[str],
    relevant_ids: list[str],
) -> float:
    """Mean Average Precision (for potential MAP metric)."""
    if not relevant_ids:
        return 0.0

    relevant_set = set(relevant_ids)
    hits = 0
    sum_precision = 0.0

    for i, rid in enumerate(returned_ids):
        if rid in relevant_set:
            hits += 1
            sum_precision += hits / (i + 1)

    return sum_precision / len(relevant_ids)

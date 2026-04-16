import logging
from typing import Any

from temporalio import activity

logger = logging.getLogger(__name__)


class ValidationResult:
    def __init__(self, valid: bool, error: str | None = None):
        self.valid = valid
        self.error = error


@activity.defn
async def validate_contract(
    collection: str,
    store_name: str,
    record_id: str,
    text: str | None,
    vector: list[float] | None,
    metadata: dict[str, Any],
    dimensions: int,
) -> dict:
    """Validate a record against the collection's data contract.

    Returns {"valid": bool, "error": str | None}
    """
    errors = []

    # Check dimensions if vector is provided
    if vector is not None and len(vector) != dimensions:
        errors.append(
            f"Vector dimension mismatch: expected {dimensions}, got {len(vector)}"
        )

    # Check that required fields exist (basic validation)
    # In production, this would load the contract from DB.
    # For now, we validate that metadata is a dict and vector dimensions match.
    if not isinstance(metadata, dict):
        errors.append("metadata must be a dictionary")

    if text is None and vector is None:
        errors.append("Either text or vector must be provided")

    if errors:
        return {"valid": False, "error": "; ".join(errors)}

    return {"valid": True, "error": None}

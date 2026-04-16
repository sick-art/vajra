# Governance & Audit

VAJRA's governance model ensures every vector operation — ingest, query, and delete — is captured in an immutable, tamper-evident audit trail. This is not optional middleware: it runs on every operation by design.

---

## Audit Log

The audit log is the foundation of VAJRA's compliance story.

### Properties

| Property | Description |
|----------|-------------|
| **Append-only** | Records are never updated or deleted |
| **Tamper-evident** | Stored in PostgreSQL with no application-level delete capability |
| **Off-critical-path** | Async writes via `asyncio.create_task()` — zero query latency overhead |
| **Complete** | 100% of queries, ingests, and errors are captured |

### Schema

```sql
TABLE audit_log (
  id             UUID PRIMARY KEY,
  operation      VARCHAR(20) NOT NULL,    -- 'ingest', 'query', 'delete'
  collection     VARCHAR(255) NOT NULL,
  store_type     VARCHAR(50),
  record_count   INTEGER,
  principal      VARCHAR(255),           -- caller identity
  status         VARCHAR(20) NOT NULL,   -- 'success', 'rejected', 'error', etc.
  error_message  TEXT,
  latency_ms     FLOAT,
  metadata_      JSONB DEFAULT '{}',
  created_at     TIMESTAMP DEFAULT NOW() -- immutable timestamp
)
```

### Status Values

| Status | Trigger |
|--------|---------|
| `success` | Operation completed successfully |
| `rejected` | Record failed contract validation |
| `duplicate_skipped` | Near-duplicate detected during ingest |
| `error` | Unrecoverable error (retries exhausted) |

---

## AuditService

**File:** `src/vectorhouse/services/audit.py`

The `AuditService` is responsible for writing audit records. It is designed for **non-blocking, off-critical-path use**:

```python
# In QueryService — fire and forget
asyncio.create_task(
    audit_service.log(
        operation="query",
        collection=collection,
        principal=principal,
        status="success",
        record_count=len(results),
        latency_ms=elapsed_ms
    )
)
```

For ingest operations, audit logging runs as **Activity 5** in the Temporal workflow, ensuring it is recorded even if the audit write must be retried.

---

## Data Contracts Enforcement

Data contracts define the acceptable shape of data for each collection. VAJRA enforces them at ingest time:

1. **Dimension check** — rejects vectors of wrong length
2. **Required metadata** — rejects records missing mandatory fields
3. **Forbidden metadata** — rejects records containing blocked fields (e.g., raw PII)
4. **Model provenance** — records the embedding model that produced each vector

See [Data Contracts](data-contracts.md) for full details.

---

## Access Policy (Planned: v2)

VAJRA's access policy layer (planned for v2) will use **Attribute-Based Access Control (ABAC)** with OPA/Rego:

```rego
package vectorhouse.policy

default allow = false

allow {
    input.action == "query"
    input.principal.team == "customer-support"
    input.resource.collection == "prod/customer-support/v2"
    input.purpose == "rag:customer-support"
}
```

Policy decisions include:
- **Allow** — full access
- **Deny** — blocked with 403
- **Result count cap** — limit results returned to non-admin principals
- **Metadata masking** — remove sensitive fields from results

---

## Compliance Use Cases

### GDPR — Right to Erasure

VAJRA supports deletion workflows that:
1. Delete records from the vector store via `adapter.delete(ids)`
2. Write an audit log entry with `operation="delete"` and `status="success"`
3. (In production) Propagate deletion to all replicas

The audit log provides **proof-of-deletion** records required by GDPR Article 17.

### SOC 2 — Access Logging

Every query and ingest is logged with:
- Principal identity (`who`)
- Timestamp (`when`)
- Collection (`what`)
- Status (`outcome`)
- Latency (`performance`)

These records are exportable for compliance reviews.

### HIPAA / Data Residency

VAJRA's collection model supports region pinning: collections can be tagged with a `residency` region. The policy engine (v2) enforces that queries never route to out-of-region replicas for regulated collections.

---

## Audit Log Querying

VAJRA does not currently expose an audit query API. To query audit records, use PostgreSQL directly:

```sql
-- Recent ingest failures
SELECT created_at, collection, error_message, principal
FROM audit_log
WHERE operation = 'ingest'
  AND status IN ('rejected', 'error')
  AND created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;

-- Query volume by collection
SELECT collection, COUNT(*) as queries, AVG(latency_ms) as avg_latency
FROM audit_log
WHERE operation = 'query'
  AND created_at > NOW() - INTERVAL '7 days'
GROUP BY collection
ORDER BY queries DESC;
```

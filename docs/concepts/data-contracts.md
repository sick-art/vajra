# Data Contracts

Data contracts define the **shape, ownership, and usage terms** for each collection. They are the cornerstone of VAJRA's governance model — every ingest operation is validated against the active contract before data touches the store.

---

## What Is a Data Contract?

A `DataContract` specifies:

| Property | Description |
|----------|-------------|
| `dimensions` | Expected embedding vector dimensionality |
| `required_metadata` | Fields that **must** be present on every record |
| `optional_metadata` | Fields that **may** be present |
| `forbidden_metadata` | Fields that **must not** be present (e.g., raw PII) |
| `embedding_model` | Model used to produce vectors (provenance tracking) |
| `version` | Contract version number |
| `is_active` | Whether this contract is enforced on new writes |

---

## Reference Schema (YAML)

```yaml
apiVersion: vectorhouse/v1
kind: DataContract
metadata:
  name: customer-support-embeddings
  owner: team:ai-platform
  stewards:
    - user:alice@example.com
spec:
  collection: prod/customer-support/v2
  embeddingModel:
    name: text-embedding-3-large
    version: "002"
    dimensions: 3072
  metadata:
    required:
      - customer_id: string
      - created_at: datetime
    optional:
      - ticket_id: string
    forbidden:
      - pii_raw_text
  sensitivity: confidential
  residency: us-east-1
  retention:
    ttlDays: 365
    archiveAfterDays: 90
    deleteAfterDays: 365
  accessPolicy: policy/customer-support-read
  sla:
    maxStalenessHours: 24
```

---

## Contract Enforcement During Ingest

During `validate_contract()` (Activity 1 of the ingest pipeline), VAJRA checks:

1. **Dimension mismatch** — vector length ≠ `dimensions` → reject
2. **Missing required field** — any key in `required_metadata` absent → reject
3. **Forbidden field present** — any key in `forbidden_metadata` found → reject
4. **Type validation** — metadata values must match declared types (when schema provided)

!!! info
    Rejected records are never silently dropped. They appear in the audit log with `status="rejected"` and a structured `error_message`.

---

## Contract Versioning

Contracts are versioned per collection. Multiple versions can exist simultaneously; only the `is_active=true` contract is enforced on new writes.

```
collection: "customer-support"
  ├── DataContract v1  (is_active=false, retired)
  └── DataContract v2  (is_active=true, current)
```

Breaking changes (e.g., adding a required field, changing dimensions) require creating a new contract version. This makes schema evolution explicit and auditable.

---

## PostgreSQL Model

```sql
TABLE data_contracts (
  id              UUID PRIMARY KEY,
  collection_id   UUID REFERENCES collections(id),
  version         INTEGER DEFAULT 1,
  dimensions      INTEGER DEFAULT 384,
  required_metadata  JSONB DEFAULT '[]',
  optional_metadata  JSONB DEFAULT '[]',
  forbidden_metadata JSONB DEFAULT '[]',
  embedding_model VARCHAR(255),
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMP DEFAULT NOW(),
  UNIQUE(collection_id, version)
)
```

---

## Design Decisions

**Why validate at ingest time, not query time?**
Enforcing contracts at write time prevents garbage data from entering the store at all. Once stored, corrupt or non-compliant vectors may silently degrade retrieval quality.

**Why forbidden fields?**
Forbidden fields prevent accidental PII or sensitive data from being attached to vectors. A field like `pii_raw_text` can be declared forbidden to ensure raw customer data never reaches the vector index.

**Why model provenance?**
Vectors produced by different models are not comparable. Storing the model name and version ensures that query-time embedding generation uses a compatible model, and enables detection of drift when models are upgraded.

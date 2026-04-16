# Collections API

Collections are the logical groupings that map to a physical vector store backend. Every ingest and query operation targets a named collection.

---

## Data Model

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "my-docs",
  "store_type": "lancedb",
  "store_name": "my-docs",
  "dimensions": 384,
  "metadata_schema": {},
  "created_at": "2024-04-16T10:00:00Z",
  "updated_at": "2024-04-16T10:00:00Z"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Unique collection identifier |
| `name` | string | Logical collection name (unique) |
| `store_type` | string | Backend adapter type (`lancedb`, `chroma`, etc.) |
| `store_name` | string | Physical collection name in the backend store |
| `dimensions` | integer | Expected embedding vector dimensionality |
| `metadata_schema` | object | JSON Schema for metadata validation |

---

## Endpoints

### `POST /v1/collections`

Create a new collection.

**Request:**

```json
{
  "name": "customer-support",
  "store_type": "lancedb",
  "store_name": "customer-support-v1",
  "dimensions": 384,
  "metadata_schema": {
    "required": ["customer_id", "ticket_id"],
    "optional": ["category"]
  }
}
```

**Response — 201 Created:**

```json
{
  "id": "...",
  "name": "customer-support",
  "store_type": "lancedb",
  "store_name": "customer-support-v1",
  "dimensions": 384,
  "metadata_schema": { ... },
  "created_at": "2024-04-16T10:00:00Z"
}
```

**Errors:**

| Code | Reason |
|------|--------|
| 400 | Invalid request body |
| 409 | Collection name already exists |

---

### `GET /v1/collections`

List all collections.

**Response:**

```json
[
  { "id": "...", "name": "my-docs", "store_type": "lancedb", ... },
  { "id": "...", "name": "customer-support", "store_type": "chroma", ... }
]
```

---

### `GET /v1/collections/{name}`

Get a specific collection by name.

**Response — 200 OK:** Collection object (see above)

**Errors:**

| Code | Reason |
|------|--------|
| 404 | Collection not found |

---

### `DELETE /v1/collections/{name}`

Delete a collection. This removes the collection record from the control plane. The underlying data in the vector store is **not** automatically deleted.

**Response — 204 No Content**

**Errors:**

| Code | Reason |
|------|--------|
| 404 | Collection not found |

---

## Example: Create and use a collection

```bash
# 1. Create collection
curl -X POST http://localhost:8000/v1/collections \
  -H "Content-Type: application/json" \
  -d '{"name":"docs","store_type":"lancedb","store_name":"docs","dimensions":384}'

# 2. List collections
curl http://localhost:8000/v1/collections

# 3. Get by name
curl http://localhost:8000/v1/collections/docs

# 4. Delete
curl -X DELETE http://localhost:8000/v1/collections/docs
```

# Workflows API

VAJRA uses Temporal for asynchronous workflow orchestration. The Workflows API lets you monitor ingest and evaluation workflows without leaving the VAJRA API.

---

## `GET /v1/workflows`

List recent workflows with optional filtering.

**Query parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | string | Filter by status: `running`, `completed`, `failed`, `cancelled` |
| `workflow_type` | string | Filter by type: `IngestSingleWorkflow`, `IngestBatchWorkflow` |
| `page_size` | integer | Results per page (default: 20) |
| `next_page_token` | string | Pagination token from previous response |

**Response:**

```json
{
  "workflows": [
    {
      "workflow_id": "ingest-docs-2024041610-xyz789",
      "workflow_type": "IngestBatchWorkflow",
      "status": "completed",
      "start_time": "2024-04-16T10:00:00Z",
      "close_time": "2024-04-16T10:00:02Z",
      "task_queue": "vectorhouse-ingest"
    }
  ],
  "next_page_token": null
}
```

---

## `GET /v1/workflows/{workflow_id}`

Get detailed status and result for a specific workflow.

**Response:**

```json
{
  "workflow_id": "ingest-docs-2024041610-xyz789",
  "workflow_type": "IngestBatchWorkflow",
  "status": "completed",
  "start_time": "2024-04-16T10:00:00Z",
  "close_time": "2024-04-16T10:00:02Z",
  "task_queue": "vectorhouse-ingest",
  "result": {
    "accepted": 10,
    "rejected": 0,
    "duplicates_skipped": 1,
    "errors": 0
  }
}
```

---

## `GET /v1/workflows/{workflow_id}/history`

Get the full event history for a workflow (activity starts, completions, errors).

Useful for debugging failed or stuck workflows.

**Response:**

```json
{
  "events": [
    { "event_id": 1, "event_type": "WorkflowExecutionStarted", "timestamp": "..." },
    { "event_id": 2, "event_type": "ActivityTaskScheduled", "activity_type": "validate_contract", "timestamp": "..." },
    { "event_id": 3, "event_type": "ActivityTaskCompleted", "activity_type": "validate_contract", "result": "{\"valid\":true}", "timestamp": "..." }
  ]
}
```

---

## `POST /v1/workflows/{workflow_id}/cancel`

Request cancellation of a running workflow.

**Response — 200 OK:**

```json
{ "message": "Cancellation requested for workflow ingest-docs-..." }
```

!!! note
    Cancellation is cooperative — activities already in progress complete normally. The workflow is cancelled after the current activity finishes.

---

## `POST /v1/workflows/{workflow_id}/terminate`

Forcefully terminate a workflow immediately, regardless of current activity state.

**Response — 200 OK:**

```json
{ "message": "Workflow terminated." }
```

!!! warning
    Termination is immediate and not cooperative. Records mid-flight may be partially written. Use `cancel` whenever possible.

---

## Workflow Statuses

| Status | Description |
|--------|-------------|
| `running` | Currently executing |
| `completed` | Finished successfully |
| `failed` | Encountered an unrecoverable error |
| `cancelled` | Cancelled by request |
| `terminated` | Forcefully terminated |
| `timed_out` | Exceeded workflow execution timeout |

---

## Temporal UI

For a full interactive view of all workflows, activities, and event histories, use the **Temporal UI** at [http://localhost:8088](http://localhost:8088) when running locally.

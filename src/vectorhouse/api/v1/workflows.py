import base64
import json
import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request

from vectorhouse.schemas.workflow import (
    ActivityEvent,
    WorkflowDetail,
    WorkflowHistory,
    WorkflowListResponse,
    WorkflowSummary,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/workflows", tags=["workflows"])


def _status_str(status) -> str:
    """Convert Temporal WorkflowExecutionStatus to string."""
    try:
        return status.name
    except Exception:
        return str(status)


@router.get("", response_model=WorkflowListResponse)
async def list_workflows(
    request: Request,
    page_size: int = Query(20, ge=1, le=100),
    status: str | None = Query(None),
    query_text: str | None = Query(None, alias="query"),
):
    tc = request.app.state.temporal_client
    if tc is None:
        raise HTTPException(status_code=503, detail="Temporal client not configured")

    parts: list[str] = []
    if status:
        parts.append(f"ExecutionStatus = '{status}'")
    if query_text:
        parts.append(query_text)
    temporal_query = " AND ".join(parts) if parts else None

    workflows: list[WorkflowSummary] = []
    async for wf in tc.list_workflows(query=temporal_query, page_size=page_size):
        workflows.append(
            WorkflowSummary(
                workflow_id=wf.id,
                workflow_type=wf.workflow_type,
                status=_status_str(wf.status),
                start_time=wf.start_time,
                close_time=wf.close_time,
                task_queue=getattr(wf, "task_queue", "") or "",
            )
        )

    return WorkflowListResponse(workflows=workflows)


@router.get("/{workflow_id}", response_model=WorkflowDetail)
async def get_workflow(request: Request, workflow_id: str):
    tc = request.app.state.temporal_client
    if tc is None:
        raise HTTPException(status_code=503, detail="Temporal client not configured")

    handle = tc.get_workflow_handle(workflow_id)
    try:
        desc = await handle.describe()
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Workflow not found: {e}")

    result = None
    try:
        if _status_str(desc.status) == "COMPLETED":
            result = await handle.result()
    except Exception:
        pass

    return WorkflowDetail(
        workflow_id=workflow_id,
        run_id=getattr(desc, "run_id", None),
        workflow_type=desc.workflow_type,
        status=_status_str(desc.status),
        start_time=desc.start_time,
        close_time=desc.close_time,
        result=result,
    )


@router.get("/{workflow_id}/history", response_model=WorkflowHistory)
async def get_workflow_history(request: Request, workflow_id: str):
    tc = request.app.state.temporal_client
    if tc is None:
        raise HTTPException(status_code=503, detail="Temporal client not configured")

    handle = tc.get_workflow_handle(workflow_id)
    try:
        history = await handle.fetch_history()
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Workflow history not found: {e}")

    events: list[ActivityEvent] = []
    for event in history.events:
        etype = event.event_type.name if event.event_type else str(event.event_type)

        activity_type = ""
        input_data: Any = None
        result_data: Any = None
        error_msg: str | None = None

        if "ACTIVITY_TASK" in etype:
            attr_name = _get_activity_attr_name(event)
            if not attr_name:
                continue
            attr = getattr(event, attr_name, None)
            if attr:
                activity_type = getattr(attr, "activity_type", {}).get("name", "") if hasattr(attr, "activity_type") else ""
                if isinstance(activity_type, dict):
                    activity_type = activity_type.get("name", "")
                if not activity_type and hasattr(attr, "activity_type"):
                    at = attr.activity_type
                    activity_type = at if isinstance(at, str) else str(at)

                input_data = _safe_payloads_to_json(getattr(attr, "input", None))
                result_data = _safe_payloads_to_json(getattr(attr, "result", None))
                failure = getattr(attr, "failure", None)
                if failure:
                    error_msg = getattr(failure, "message", str(failure))
        elif "WORKFLOW_EXECUTION_COMPLETED" in etype:
            attr = getattr(event, "workflow_execution_completed_event_attributes", None)
            if attr:
                result_data = _safe_payloads_to_json(getattr(attr, "result", None))
        elif "WORKFLOW_EXECUTION_FAILED" in etype:
            attr = getattr(event, "workflow_execution_failed_event_attributes", None)
            if attr:
                failure = getattr(attr, "failure", None)
                if failure:
                    error_msg = getattr(failure, "message", str(failure))

        events.append(
            ActivityEvent(
                activity_type=activity_type,
                event_type=etype,
                timestamp=event.event_time.ToDatetime() if hasattr(event, "event_time") and event.event_time else None,
                input_=input_data,
                result=result_data,
                error=error_msg,
            )
        )

    return WorkflowHistory(workflow_id=workflow_id, events=events)


def _get_activity_attr_name(event) -> str | None:
    """Find the activity attribute field name on a history event."""
    for attr in ("activity_task_scheduled_event_attributes", "activity_task_started_event_attributes",
                 "activity_task_completed_event_attributes", "activity_task_failed_event_attributes",
                 "activity_task_timed_out_event_attributes"):
        if hasattr(event, attr) and getattr(event, attr):
            return attr
    return None


def _safe_payloads_to_json(payloads) -> Any:
    """Try to decode Temporal payloads to JSON-compatible data."""
    if payloads is None:
        return None
    try:
        if hasattr(payloads, "payloads"):
            items = list(payloads.payloads)
        elif isinstance(payloads, (list, tuple)):
            items = list(payloads)
        else:
            return str(payloads)

        results = []
        for p in items:
            data = p.data
            encoding = p.metadata.get("encoding", b"") if hasattr(p, "metadata") else b""
            if isinstance(data, bytes):
                if encoding == b"json/plain":
                    results.append(json.loads(data.decode("utf-8")))
                else:
                    try:
                        results.append(json.loads(data.decode("utf-8")))
                    except Exception:
                        results.append(base64.b64encode(data).decode("ascii"))
            else:
                results.append(str(data))
        return results[0] if len(results) == 1 else results
    except Exception:
        return None


@router.post("/{workflow_id}/cancel")
async def cancel_workflow(request: Request, workflow_id: str):
    tc = request.app.state.temporal_client
    if tc is None:
        raise HTTPException(status_code=503, detail="Temporal client not configured")

    handle = tc.get_workflow_handle(workflow_id)
    try:
        await handle.cancel()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to cancel: {e}")

    return {"status": "canceled"}


@router.post("/{workflow_id}/terminate")
async def terminate_workflow(request: Request, workflow_id: str, body: dict | None = None):
    tc = request.app.state.temporal_client
    if tc is None:
        raise HTTPException(status_code=503, detail="Temporal client not configured")

    reason = (body or {}).get("reason", "Terminated via API")
    handle = tc.get_workflow_handle(workflow_id)
    try:
        await handle.terminate(reason=reason)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to terminate: {e}")

    return {"status": "terminated"}

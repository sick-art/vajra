from datetime import datetime
from typing import Any

from pydantic import BaseModel


class WorkflowSummary(BaseModel):
    workflow_id: str
    workflow_type: str
    status: str  # RUNNING, COMPLETED, FAILED, CANCELED, TERMINATED, CONTINUED_AS_NEW, TIMED_OUT
    start_time: datetime | None = None
    close_time: datetime | None = None
    task_queue: str = ""


class WorkflowListResponse(BaseModel):
    workflows: list[WorkflowSummary]
    next_page_token: str | None = None


class WorkflowDetail(BaseModel):
    workflow_id: str
    run_id: str | None = None
    workflow_type: str
    status: str
    start_time: datetime | None = None
    close_time: datetime | None = None
    input: dict[str, Any] | None = None
    result: Any | None = None


class ActivityEvent(BaseModel):
    activity_type: str
    event_type: str
    timestamp: datetime | None = None
    input_: Any | None = None
    result: Any | None = None
    error: str | None = None


class WorkflowHistory(BaseModel):
    workflow_id: str
    events: list[ActivityEvent]

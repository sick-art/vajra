import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useParams, useNavigate } from "react-router-dom"
import {
  ArrowLeft,
  Ban,
  XCircle,
  CheckCircle2,
  AlertCircle,
  Clock,
  CircleDot,
  Loader2,
} from "lucide-react"
import type { WorkflowDetail, WorkflowHistory } from "@/lib/api-client"
import { workflowApi } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { WorkflowStatusBadge, StatusDot } from "@/components/workflow-status-badge"

function formatDuration(start: string | null, close: string | null): string {
  if (!start) return "-"
  const end = close ? new Date(close) : new Date()
  const ms = end.getTime() - new Date(start).getTime()
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  if (ms < 3_600_000) return `${(ms / 60_000).toFixed(2)}m`
  return `${(ms / 3_600_000).toFixed(2)}h`
}

function eventIcon(eventType: string) {
  if (eventType.includes("COMPLETED"))
    return <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
  if (eventType.includes("FAILED") || eventType.includes("TIMED_OUT"))
    return <AlertCircle className="h-3.5 w-3.5 text-red-400" />
  if (eventType.includes("STARTED") || eventType.includes("RUNNING"))
    return <CircleDot className="h-3.5 w-3.5 text-blue-400" />
  if (eventType.includes("SCHEDULED"))
    return <Clock className="h-3.5 w-3.5 text-muted-foreground" />
  return <Clock className="h-3.5 w-3.5 text-muted-foreground" />
}

function eventBadgeClass(eventType: string): string {
  if (eventType.includes("COMPLETED")) return "border-green-800 text-green-400"
  if (eventType.includes("FAILED") || eventType.includes("TIMED_OUT"))
    return "border-red-800 text-red-400"
  if (eventType.includes("STARTED") || eventType.includes("SCHEDULED"))
    return "border-blue-800 text-blue-400"
  return "text-muted-foreground"
}

export default function WorkflowDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: wf, isLoading: wfLoading } = useQuery<WorkflowDetail>({
    queryKey: ["workflow", id],
    queryFn: () => workflowApi.get(id!),
    enabled: !!id,
    refetchInterval: (q) => (q.state.data?.status === "RUNNING" ? 3_000 : false),
  })

  const { data: history, isLoading: histLoading } = useQuery<WorkflowHistory>({
    queryKey: ["workflow-history", id],
    queryFn: () => workflowApi.history(id!),
    enabled: !!id,
    refetchInterval: (q) => {
      const wfQ = queryClient.getQueryData<WorkflowDetail>(["workflow", id])
      return wfQ?.status === "RUNNING" ? 3_000 : false
    },
  })

  const cancelMutation = useMutation({
    mutationFn: () => workflowApi.cancel(id!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workflow", id] }),
  })

  const terminateMutation = useMutation({
    mutationFn: () => workflowApi.terminate(id!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workflow", id] }),
  })

  if (wfLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!wf) {
    return (
      <div className="flex flex-col items-center rounded-lg border border-dashed py-20 text-center">
        <p className="text-sm font-medium text-muted-foreground">Workflow not found</p>
        <Button variant="link" size="sm" onClick={() => navigate("/workflows")}>
          Back to workflows
        </Button>
      </div>
    )
  }

  const isRunning = wf.status === "RUNNING"
  const visibleEvents = (history?.events ?? []).filter(
    (e) => e.activity_type || e.event_type.includes("WORKFLOW_EXECUTION"),
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/workflows")}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
          <h1 className="font-mono text-sm font-semibold truncate max-w-80">
            {wf.workflow_id}
          </h1>
          <div className="flex items-center gap-1.5">
            <StatusDot status={wf.status} />
            <WorkflowStatusBadge status={wf.status} />
          </div>
        </div>
        {isRunning && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
            >
              <Ban className="mr-1 h-3 w-3" />
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => terminateMutation.mutate()}
              disabled={terminateMutation.isPending}
            >
              <XCircle className="mr-1 h-3 w-3" />
              Terminate
            </Button>
          </div>
        )}
      </div>

      {/* Metadata */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Workflow Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
            <div>
              <p className="text-xs text-muted-foreground">Type</p>
              <p className="text-sm font-medium">
                {wf.workflow_type.replace("Workflow", "")}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Run ID</p>
              <p className="truncate font-mono text-xs text-muted-foreground">
                {wf.run_id ?? "-"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Duration</p>
              <p className="text-sm tabular-nums">
                {formatDuration(wf.start_time, wf.close_time)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Started</p>
              <p className="text-xs text-muted-foreground">
                {wf.start_time ? new Date(wf.start_time).toLocaleString() : "-"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Closed</p>
              <p className="text-xs text-muted-foreground">
                {wf.close_time ? new Date(wf.close_time).toLocaleString() : "-"}
              </p>
            </div>
          </div>

          {wf.input && Object.keys(wf.input).length > 0 && (
            <>
              <Separator className="my-3" />
              <div>
                <p className="text-xs text-muted-foreground mb-1.5">Input</p>
                <pre className="overflow-auto rounded-md bg-zinc-900 p-3 font-mono text-xs max-h-48 text-zinc-200">
                  {JSON.stringify(wf.input, null, 2)}
                </pre>
              </div>
            </>
          )}

          {wf.result !== null && wf.result !== undefined && (
            <>
              <Separator className="my-3" />
              <div>
                <p className="text-xs text-muted-foreground mb-1.5">Result</p>
                <pre className="overflow-auto rounded-md bg-zinc-900 p-3 font-mono text-xs max-h-48 text-zinc-200">
                  {JSON.stringify(wf.result, null, 2)}
                </pre>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Activity Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Activity Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          {histLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : visibleEvents.length === 0 ? (
            <div className="flex flex-col items-center rounded-lg border border-dashed py-8 text-center">
              <Clock className="mb-2 h-6 w-6 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No events recorded yet</p>
            </div>
          ) : (
            <div className="relative pl-6">
              {/* Vertical timeline line */}
              <div className="absolute left-2.5 top-2 bottom-2 w-px bg-border" />
              {visibleEvents.map((event, idx) => (
                <div key={idx} className="relative mb-3 last:mb-0">
                  {/* Timeline dot */}
                  <div className="absolute -left-4 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-card ring-1 ring-border">
                    {eventIcon(event.event_type)}
                  </div>
                  {/* Event card */}
                  <div className="rounded-md border border-border bg-card/50 p-3 ml-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {event.activity_type && (
                        <span className="text-sm font-medium">
                          {event.activity_type}
                        </span>
                      )}
                      <Badge
                        variant="outline"
                        className={`text-xs ${eventBadgeClass(event.event_type)}`}
                      >
                        {event.event_type.replace(/_/g, " ").toLowerCase()}
                      </Badge>
                      {event.timestamp && (
                        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                          {new Date(event.timestamp).toLocaleTimeString()}
                        </span>
                      )}
                    </div>
                    {event.error && (
                      <p className="mt-1.5 text-xs text-red-400 font-mono">
                        {event.error}
                      </p>
                    )}
                    {event.result !== null && event.result !== undefined && (
                      <pre className="mt-1.5 overflow-auto rounded bg-zinc-900 p-2 font-mono text-xs max-h-32 text-zinc-300">
                        {JSON.stringify(event.result, null, 2)}
                      </pre>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

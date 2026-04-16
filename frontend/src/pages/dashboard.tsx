import { useQuery } from "@tanstack/react-query"
import {
  Workflow,
  CheckCircle2,
  XCircle,
  Loader2,
  Search,
  BarChart3,
  Database,
  ArrowRight,
} from "lucide-react"
import { useNavigate } from "react-router-dom"
import type { WorkflowListResponse } from "@/lib/api-client"
import { workflowApi } from "@/lib/api-client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ConnectionStatus } from "@/components/connection-status"
import { WorkflowStatusBadge, StatusDot } from "@/components/workflow-status-badge"

function relativeTime(iso: string | null): string {
  if (!iso) return "-"
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export default function DashboardPage() {
  const navigate = useNavigate()

  const { data: wfData, isLoading: wfLoading } = useQuery<WorkflowListResponse>({
    queryKey: ["workflows", { page_size: 10 }],
    queryFn: () => workflowApi.list({ page_size: 10 }),
    refetchInterval: (q) => {
      const workflows = q.state.data?.workflows ?? []
      return workflows.some((w) => w.status === "RUNNING") ? 5_000 : 30_000
    },
  })

  const workflows = wfData?.workflows ?? []
  const running = workflows.filter((w) => w.status === "RUNNING").length
  const completed = workflows.filter((w) => w.status === "COMPLETED").length
  const failed = workflows.filter((w) => w.status === "FAILED").length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <ConnectionStatus />
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => navigate("/workflows")}
        >
          <Workflow className="mr-1.5 h-3.5 w-3.5" />
          Trigger Ingest
          <ArrowRight className="ml-1.5 h-3 w-3 text-muted-foreground" />
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => navigate("/query")}
        >
          <Search className="mr-1.5 h-3.5 w-3.5" />
          Run Query
          <ArrowRight className="ml-1.5 h-3 w-3 text-muted-foreground" />
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => navigate("/eval")}
        >
          <BarChart3 className="mr-1.5 h-3.5 w-3.5" />
          New Eval
          <ArrowRight className="ml-1.5 h-3 w-3 text-muted-foreground" />
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => navigate("/collections")}
        >
          <Database className="mr-1.5 h-3.5 w-3.5" />
          Collections
          <ArrowRight className="ml-1.5 h-3 w-3 text-muted-foreground" />
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-l-2 border-l-zinc-600">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
            <Workflow className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">
              {wfLoading ? <Skeleton className="h-7 w-10" /> : workflows.length}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">recent workflows</p>
          </CardContent>
        </Card>
        <Card className="border-l-2 border-l-blue-600">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Running</CardTitle>
            <Loader2 className={`h-4 w-4 text-blue-400 ${running > 0 ? "animate-spin" : ""}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums text-blue-400">
              {wfLoading ? <Skeleton className="h-7 w-8" /> : running}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">in progress</p>
          </CardContent>
        </Card>
        <Card className="border-l-2 border-l-green-600">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums text-green-400">
              {wfLoading ? <Skeleton className="h-7 w-8" /> : completed}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">succeeded</p>
          </CardContent>
        </Card>
        <Card className="border-l-2 border-l-red-600">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Failed</CardTitle>
            <XCircle className="h-4 w-4 text-red-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums text-red-400">
              {wfLoading ? <Skeleton className="h-7 w-8" /> : failed}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">errored</p>
          </CardContent>
        </Card>
      </div>

      {/* Recent workflows */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium">Recent Workflows</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground"
            onClick={() => navigate("/workflows")}
          >
            View all
            <ArrowRight className="ml-1 h-3 w-3" />
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {wfLoading ? (
            <div className="space-y-px px-4 pb-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : workflows.length === 0 ? (
            <div className="flex flex-col items-center rounded-lg border border-dashed mx-4 mb-4 py-10 text-center">
              <Workflow className="mb-3 h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm font-medium">No workflows yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Trigger an ingest workflow to get started
              </p>
              <Button
                size="sm"
                className="mt-4"
                onClick={() => navigate("/workflows")}
              >
                Trigger Ingest
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {workflows.slice(0, 10).map((wf) => (
                <div
                  key={wf.workflow_id}
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => navigate(`/workflows/${wf.workflow_id}`)}
                >
                  <StatusDot status={wf.status} />
                  <span className="font-mono text-xs text-muted-foreground truncate flex-1 min-w-0">
                    {wf.workflow_id.slice(0, 36)}
                  </span>
                  <Badge variant="secondary" className="text-xs shrink-0">
                    {wf.workflow_type.replace("Workflow", "")}
                  </Badge>
                  <WorkflowStatusBadge status={wf.status} className="shrink-0" />
                  <span className="text-xs text-muted-foreground tabular-nums shrink-0 w-16 text-right">
                    {relativeTime(wf.start_time)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

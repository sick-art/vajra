import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { Loader2, XCircle, Ban, Play, RefreshCw } from "lucide-react"
import type { WorkflowListResponse, IngestResponse } from "@/lib/api-client"
import { workflowApi, collectionApi, ingestApi } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { WorkflowStatusBadge, StatusDot } from "@/components/workflow-status-badge"

const STATUS_TABS = [
  { value: "all",        label: "All" },
  { value: "RUNNING",    label: "Running" },
  { value: "COMPLETED",  label: "Completed" },
  { value: "FAILED",     label: "Failed" },
  { value: "CANCELED",   label: "Canceled" },
  { value: "TERMINATED", label: "Terminated" },
]

function formatDuration(start: string | null, close: string | null): string {
  if (!start) return "-"
  const end = close ? new Date(close) : new Date()
  const ms = end.getTime() - new Date(start).getTime()
  if (ms < 60_000) return `${(ms / 1000).toFixed(0)}s`
  if (ms < 3_600_000) return `${(ms / 60_000).toFixed(1)}m`
  return `${(ms / 3_600_000).toFixed(1)}h`
}

export default function WorkflowsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [ingestOpen, setIngestOpen] = useState(false)

  const { data, isLoading, refetch } = useQuery<WorkflowListResponse>({
    queryKey: ["workflows", statusFilter],
    queryFn: () =>
      workflowApi.list({
        page_size: 50,
        status: statusFilter !== "all" ? statusFilter : undefined,
      }),
    refetchInterval: (q) =>
      (q.state.data?.workflows ?? []).some((w) => w.status === "RUNNING")
        ? 5_000
        : false,
  })

  const cancelMutation = useMutation({
    mutationFn: (id: string) => workflowApi.cancel(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workflows"] }),
  })

  const terminateMutation = useMutation({
    mutationFn: (id: string) => workflowApi.terminate(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workflows"] }),
  })

  const workflows = data?.workflows ?? []
  const hasRunning = workflows.some((w) => w.status === "RUNNING")

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Workflows</h1>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            title="Refresh"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Dialog open={ingestOpen} onOpenChange={setIngestOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Play className="mr-1.5 h-3.5 w-3.5" />
                Trigger Ingest
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Trigger Ingest Workflow</DialogTitle>
              </DialogHeader>
              <IngestForm
                onSuccess={(resp: IngestResponse) => {
                  setIngestOpen(false)
                  navigate(`/workflows/${resp.workflow_id}`)
                }}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex items-center gap-3">
        <Tabs value={statusFilter} onValueChange={setStatusFilter}>
          <TabsList>
            {STATUS_TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {hasRunning && (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
            Live
          </span>
        )}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-px p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : workflows.length === 0 ? (
            <div className="flex flex-col items-center rounded-lg border border-dashed m-4 py-12 text-center">
              <Play className="mb-3 h-7 w-7 text-muted-foreground/40" />
              <p className="text-sm font-medium">No workflows found</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {statusFilter !== "all"
                  ? `No ${statusFilter.toLowerCase()} workflows`
                  : "Trigger an ingest to create your first workflow"}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Workflow ID</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workflows.map((wf) => (
                  <TableRow
                    key={wf.workflow_id}
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => navigate(`/workflows/${wf.workflow_id}`)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <StatusDot status={wf.status} />
                        <WorkflowStatusBadge status={wf.status} />
                      </div>
                    </TableCell>
                    <TableCell className="max-w-40 truncate font-mono text-xs text-muted-foreground">
                      {wf.workflow_id}
                    </TableCell>
                    <TableCell className="text-sm">
                      {wf.workflow_type.replace("Workflow", "")}
                    </TableCell>
                    <TableCell className="tabular-nums text-xs text-muted-foreground">
                      {formatDuration(wf.start_time, wf.close_time)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {wf.start_time
                        ? new Date(wf.start_time).toLocaleString()
                        : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      {wf.status === "RUNNING" && (
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Cancel"
                            onClick={(e) => {
                              e.stopPropagation()
                              cancelMutation.mutate(wf.workflow_id)
                            }}
                            disabled={cancelMutation.isPending}
                          >
                            <Ban className="h-3.5 w-3.5 text-yellow-400" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Terminate"
                            onClick={(e) => {
                              e.stopPropagation()
                              terminateMutation.mutate(wf.workflow_id)
                            }}
                            disabled={terminateMutation.isPending}
                          >
                            <XCircle className="h-3.5 w-3.5 text-red-400" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ---- Ingest Form ----

function IngestForm({ onSuccess }: { onSuccess: (resp: IngestResponse) => void }) {
  const [collection, setCollection] = useState("")
  const [storeType, setStoreType] = useState("lancedb")
  const [recordsJson, setRecordsJson] = useState(
    JSON.stringify(
      [{ id: "doc-1", text: "Sample document text to ingest", metadata: {} }],
      null,
      2,
    ),
  )
  const [error, setError] = useState<string | null>(null)

  const { data: collData } = useQuery({
    queryKey: ["collections"],
    queryFn: collectionApi.list,
  })

  const ingestMutation = useMutation({
    mutationFn: async () => {
      let records
      try {
        records = JSON.parse(recordsJson)
      } catch {
        throw new Error("Invalid JSON — check the records format")
      }
      return ingestApi.ingest(collection, { records, store_type: storeType })
    },
    onSuccess,
    onError: (err: Error) => setError(err.message),
  })

  const collections = collData?.collections ?? []

  return (
    <div className="space-y-4 pt-2">
      {error && (
        <div className="rounded-md bg-red-500/10 border border-red-800 p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Collection</Label>
          <Select
            value={collection}
            onValueChange={(v) => {
              setCollection(v)
              const coll = collections.find((c) => c.name === v)
              if (coll) setStoreType(coll.store_type)
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select collection" />
            </SelectTrigger>
            <SelectContent>
              {collections.map((c) => (
                <SelectItem key={c.name} value={c.name}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Store Type</Label>
          <Select value={storeType} onValueChange={setStoreType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="lancedb">LanceDB</SelectItem>
              <SelectItem value="chroma">ChromaDB</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>
          Records{" "}
          <span className="font-normal text-muted-foreground">
            — JSON array of {"{id, text, metadata}"}
          </span>
        </Label>
        <Textarea
          value={recordsJson}
          onChange={(e) => setRecordsJson(e.target.value)}
          rows={8}
          className="font-mono text-xs"
        />
      </div>

      <Button
        className="w-full"
        onClick={() => ingestMutation.mutate()}
        disabled={!collection || ingestMutation.isPending}
      >
        {ingestMutation.isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Triggering…
          </>
        ) : (
          <>
            <Play className="mr-2 h-4 w-4" />
            Trigger Ingest
          </>
        )}
      </Button>
    </div>
  )
}

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import {
  BarChart3,
  Loader2,
  Target,
  FileText,
  TrendingUp,
  Play,
  Plus,
} from "lucide-react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts"
import type { EvalRun, EvalDataset, ModelInfo } from "@/lib/api-client"
import { evalApi, settingsApi } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { ChartContainer } from "@/components/ui/chart"
import { WorkflowStatusBadge, StatusDot } from "@/components/workflow-status-badge"

// ---- Create Eval Run Dialog ----

interface CreateEvalRunDialogProps {
  open: boolean
  onClose: () => void
}

function CreateEvalRunDialog({ open, onClose }: CreateEvalRunDialogProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [datasetId, setDatasetId] = useState("")
  const [runName, setRunName] = useState(
    `Run ${new Date().toISOString().slice(0, 10)}`,
  )
  const [topK, setTopK] = useState("10")
  const [searchType, setSearchType] = useState("dense")
  const [storeType, setStoreType] = useState("any")
  const [embeddingModel, setEmbeddingModel] = useState("active")
  const [error, setError] = useState("")

  const { data: datasets } = useQuery<EvalDataset[]>({
    queryKey: ["eval-datasets"],
    queryFn: evalApi.listDatasets,
    enabled: open,
  })

  const { data: modelsData } = useQuery<{ models: ModelInfo[]; active_model: string }>({
    queryKey: ["models"],
    queryFn: settingsApi.listModels,
    enabled: open,
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!datasetId) throw new Error("Please select a dataset")
      const run = await evalApi.createRun({
        dataset_id: datasetId,
        name: runName.trim() || `Run ${new Date().toISOString().slice(0, 10)}`,
        top_k: parseInt(topK, 10) || 10,
        search_type: searchType,
        store_type: storeType === "any" ? null : storeType,
        embedding_model: embeddingModel === "active" ? null : embeddingModel,
      })
      await evalApi.executeRun(run.id)
      return run
    },
    onSuccess: (run) => {
      queryClient.invalidateQueries({ queryKey: ["eval-runs"] })
      onClose()
      navigate(`/eval/runs/${run.id}`)
    },
    onError: (err: Error) => setError(err.message),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    createMutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Play className="h-4 w-4 text-primary" />
            New Evaluation Run
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* Dataset */}
          <div className="space-y-1.5">
            <Label>Dataset <span className="text-destructive">*</span></Label>
            <Select value={datasetId} onValueChange={setDatasetId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a dataset…" />
              </SelectTrigger>
              <SelectContent>
                {(datasets ?? []).map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      ({d.query_count} queries)
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Run Name */}
          <div className="space-y-1.5">
            <Label>Run Name</Label>
            <Input
              value={runName}
              onChange={(e) => setRunName(e.target.value)}
              placeholder="Run 2024-01-01"
            />
          </div>

          {/* Top K + Search Type */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Top K</Label>
              <Input
                type="number"
                min={1}
                max={100}
                value={topK}
                onChange={(e) => setTopK(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Search Type</Label>
              <Select value={searchType} onValueChange={setSearchType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dense">Dense</SelectItem>
                  <SelectItem value="hybrid">Hybrid</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Store Type + Embedding Model */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Store Type</Label>
              <Select value={storeType} onValueChange={setStoreType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
                  <SelectItem value="lancedb">LanceDB</SelectItem>
                  <SelectItem value="chroma">Chroma</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Embedding Model</Label>
              <Select value={embeddingModel} onValueChange={setEmbeddingModel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">
                    Active ({modelsData?.active_model?.split("/").pop() ?? "default"})
                  </SelectItem>
                  {(modelsData?.models ?? []).map((m) => (
                    <SelectItem key={m.name} value={m.name}>
                      {m.name.split("/").pop()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!datasetId || createMutation.isPending}
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Starting…
                </>
              ) : (
                <>
                  <Play className="mr-1.5 h-3.5 w-3.5" />
                  Run Evaluation
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---- Status distribution chart config ----

const STATUS_CHART_CONFIG = {
  completed: { label: "Completed", color: "oklch(0.7 0.15 160)" },
  running:   { label: "Running",   color: "oklch(0.63 0.18 240)" },
  failed:    { label: "Failed",    color: "oklch(0.63 0.22 25)" },
  pending:   { label: "Pending",   color: "oklch(0.66 0 0)" },
}

// ---- Page ----

export default function EvalDashboardPage() {
  const navigate = useNavigate()
  const [newRunOpen, setNewRunOpen] = useState(false)

  const { data: runs, isLoading } = useQuery<EvalRun[]>({
    queryKey: ["eval-runs"],
    queryFn: () => evalApi.listRuns(),
    refetchInterval: (q) => {
      const items = q.state.data ?? []
      return items.some(
        (r: EvalRun) => r.status === "running" || r.status === "pending",
      )
        ? 5_000
        : false
    },
  })

  const evalRuns = runs ?? []
  const completedRuns = evalRuns.filter((r) => r.status === "completed")
  const activeRuns = evalRuns.filter(
    (r) => r.status === "running" || r.status === "pending",
  )
  const failedRuns = evalRuns.filter((r) => r.status === "failed")

  // Build chart data
  const chartData = [
    { status: "completed", count: completedRuns.length },
    { status: "running",   count: evalRuns.filter((r) => r.status === "running").length },
    { status: "pending",   count: evalRuns.filter((r) => r.status === "pending").length },
    { status: "failed",    count: failedRuns.length },
  ].filter((d) => d.count > 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Evaluation</h1>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => navigate("/eval/datasets")}>
            <FileText className="mr-1 h-3 w-3" />
            Datasets
          </Button>
          <Button size="sm" onClick={() => setNewRunOpen(true)}>
            <Plus className="mr-1 h-3 w-3" />
            New Run
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-l-2 border-l-zinc-600">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Runs</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{evalRuns.length}</div>
          </CardContent>
        </Card>
        <Card className="border-l-2 border-l-green-600">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums text-green-400">
              {completedRuns.length}
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-2 border-l-blue-600">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
            <Loader2 className={`h-4 w-4 text-blue-400 ${activeRuns.length > 0 ? "animate-spin" : ""}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums text-blue-400">
              {activeRuns.length}
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-2 border-l-red-600">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Failed</CardTitle>
            <Target className="h-4 w-4 text-red-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums text-red-400">
              {failedRuns.length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Status distribution chart */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Run Status Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={STATUS_CHART_CONFIG} className="h-[140px]">
              <BarChart
                data={chartData}
                margin={{ top: 4, right: 8, bottom: 4, left: -20 }}
                layout="vertical"
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border)"
                  horizontal={false}
                />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <YAxis
                  type="category"
                  dataKey="status"
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                  width={70}
                />
                <Tooltip
                  cursor={{ fill: "oklch(0.20 0 0)", opacity: 0.6 }}
                  content={({ payload }) => {
                    if (!payload?.length) return null
                    const entry = payload[0].payload as { status: string; count: number }
                    return (
                      <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-md text-xs">
                        <p className="capitalize text-muted-foreground">{entry.status}</p>
                        <p className="font-mono font-medium text-foreground">{entry.count} runs</p>
                      </div>
                    )
                  }}
                />
                <Bar dataKey="count" radius={[0, 3, 3, 0]}>
                  {chartData.map((entry) => (
                    <Cell
                      key={entry.status}
                      fill={
                        STATUS_CHART_CONFIG[
                          entry.status as keyof typeof STATUS_CHART_CONFIG
                        ]?.color ?? "var(--chart-1)"
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {/* Runs table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Recent Runs</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : evalRuns.length === 0 ? (
            <div className="flex flex-col items-center rounded-lg border border-dashed py-12 text-center">
              <Target className="mb-3 h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm font-medium">No evaluation runs yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Create a dataset first, then run an evaluation
              </p>
              <div className="mt-4 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate("/eval/datasets")}
                >
                  <FileText className="mr-1 h-3 w-3" />
                  View Datasets
                </Button>
                <Button size="sm" onClick={() => setNewRunOpen(true)}>
                  <Plus className="mr-1 h-3 w-3" />
                  New Run
                </Button>
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Top K</TableHead>
                  <TableHead>Search</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {evalRuns.map((run) => (
                  <TableRow
                    key={run.id}
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => navigate(`/eval/runs/${run.id}`)}
                  >
                    <TableCell className="font-medium">{run.name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <StatusDot status={run.status} />
                        <WorkflowStatusBadge status={run.status} />
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {run.embedding_model
                        ? run.embedding_model.split("/").pop()
                        : "active"}
                    </TableCell>
                    <TableCell className="tabular-nums">{run.top_k}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {run.search_type}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {run.created_at
                        ? new Date(run.created_at).toLocaleString()
                        : "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CreateEvalRunDialog open={newRunOpen} onClose={() => setNewRunOpen(false)} />
    </div>
  )
}

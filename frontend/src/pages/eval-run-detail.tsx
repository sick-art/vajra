import { useQuery } from "@tanstack/react-query"
import { useParams, useNavigate } from "react-router-dom"
import { ArrowLeft, Download, Loader2, Target, TrendingUp } from "lucide-react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ScatterChart,
  Scatter,
  ZAxis,
} from "recharts"
import type { EvalRunDetail, EvalResult } from "@/lib/api-client"
import { evalApi } from "@/lib/api-client"
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
import { Skeleton } from "@/components/ui/skeleton"
import {
  ChartContainer,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { WorkflowStatusBadge, StatusDot } from "@/components/workflow-status-badge"
import { cn } from "@/lib/utils"

// ---- Chart config ----

const metricsConfig: ChartConfig = {
  avg:    { label: "Average", color: "oklch(0.606 0.247 271)" },
  median: { label: "Median",  color: "oklch(0.488 0.243 264)" },
}

const scatterConfig: ChartConfig = {
  query: { label: "Query", color: "oklch(0.606 0.247 271)" },
}

// ---- Helpers ----

function exportToCSV(results: EvalResult[], runId: string) {
  const headers = [
    "query_text",
    "ndcg",
    "recall_at_k",
    "precision_at_k",
    "latency_ms",
    "returned_count",
  ]
  const rows = results.map((r) => [
    JSON.stringify(r.query_text),
    r.ndcg ?? "",
    r.recall_at_k ?? "",
    r.precision_at_k ?? "",
    r.latency_ms ?? "",
    r.returned_ids.length,
  ])
  const csv = [headers, ...rows].map((r) => r.join(",")).join("\n")
  const blob = new Blob([csv], { type: "text/csv" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `eval-run-${runId}-results.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ---- Page ----

export default function EvalRunDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: run, isLoading: runLoading } = useQuery<EvalRunDetail>({
    queryKey: ["eval-run", id],
    queryFn: () => evalApi.getRun(id!),
    enabled: !!id,
    refetchInterval: (q) =>
      q.state.data?.status === "running" ? 3_000 : false,
  })

  const { data: results, isLoading: resultsLoading } = useQuery<EvalResult[]>({
    queryKey: ["eval-run-results", id],
    queryFn: () => evalApi.getRunResults(id!),
    enabled: !!id && run?.status === "completed",
  })

  if (runLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      </div>
    )
  }

  if (!run) {
    return (
      <div className="flex flex-col items-center rounded-lg border border-dashed py-20 text-center">
        <Target className="mb-3 h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm font-medium">Run not found</p>
        <Button variant="link" size="sm" onClick={() => navigate("/eval")}>
          Back to evaluations
        </Button>
      </div>
    )
  }

  const metrics = run.metrics

  // Build metrics chart data
  const metricsChartData = metrics
    ? [
        {
          metric: "NDCG",
          avg: parseFloat((metrics.avg_ndcg * 100).toFixed(1)),
          median: parseFloat(((metrics.median_ndcg ?? 0) * 100).toFixed(1)),
        },
        {
          metric: "Recall@K",
          avg: parseFloat((metrics.avg_recall_at_k * 100).toFixed(1)),
          median: parseFloat(
            ((metrics.median_recall_at_k ?? 0) * 100).toFixed(1),
          ),
        },
        {
          metric: "Precision@K",
          avg: parseFloat((metrics.avg_precision_at_k * 100).toFixed(1)),
          median: parseFloat(
            ((metrics.median_precision_at_k ?? 0) * 100).toFixed(1),
          ),
        },
      ]
    : []

  // Build scatter data (NDCG vs latency)
  const scatterData = (results ?? [])
    .filter((r) => r.ndcg !== null && r.latency_ms !== null)
    .map((r) => ({
      x: parseFloat(r.latency_ms!.toFixed(1)),
      y: parseFloat((r.ndcg! * 100).toFixed(1)),
      z: 1,
      query: r.query_text.slice(0, 60),
    }))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/eval")}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back
        </Button>
        <h1 className="text-lg font-semibold">{run.name}</h1>
        <div className="flex items-center gap-1.5">
          <StatusDot status={run.status} />
          <WorkflowStatusBadge status={run.status} />
        </div>
        {run.status === "running" && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Running…
          </span>
        )}
      </div>

      {/* Run metadata */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Run Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
            <div>
              <p className="text-xs text-muted-foreground">Dataset</p>
              <p className="font-mono text-xs truncate">{run.dataset_id}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Model</p>
              <p className="font-mono text-xs">
                {run.embedding_model?.split("/").pop() ?? "active"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Top K</p>
              <p className="text-sm tabular-nums">{run.top_k}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Search Type</p>
              <p className="text-sm">{run.search_type}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Store Type</p>
              <p className="text-sm">{run.store_type ?? "any"}</p>
            </div>
          </div>
          {metrics && (
            <div className="mt-3 pt-3 border-t flex items-center gap-1.5 text-xs text-muted-foreground">
              <TrendingUp className="h-3.5 w-3.5" />
              <span>
                {metrics.total_queries} queries evaluated
                {metrics.p95_latency_ms != null && (
                  <> · p95 latency: {metrics.p95_latency_ms.toFixed(1)} ms</>
                )}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Metric summary cards */}
      {metrics && (
        <div className="grid gap-4 md:grid-cols-3">
          <MetricCard label="NDCG" value={metrics.avg_ndcg} total={metrics.total_queries} />
          <MetricCard label="Recall@K" value={metrics.avg_recall_at_k} total={metrics.total_queries} />
          <MetricCard label="Precision@K" value={metrics.avg_precision_at_k} total={metrics.total_queries} />
        </div>
      )}

      {/* Metrics comparison bar chart */}
      {metricsChartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Metrics Comparison (avg vs median)</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={metricsConfig} className="h-[200px]">
              <BarChart
                data={metricsChartData}
                margin={{ top: 4, right: 8, bottom: 4, left: -20 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border)"
                  vertical={false}
                />
                <XAxis
                  dataKey="metric"
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip
                  content={
                    <ChartTooltipContent
                      config={metricsConfig}
                      formatter={(v) => `${v}%`}
                    />
                  }
                />
                <Bar
                  dataKey="avg"
                  fill="var(--color-avg)"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={40}
                />
                <Bar
                  dataKey="median"
                  fill="var(--color-median)"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={40}
                />
              </BarChart>
            </ChartContainer>
            {/* Legend */}
            <div className="flex justify-center gap-4 mt-2">
              {Object.entries(metricsConfig).map(([key, cfg]) => (
                <div key={key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: cfg.color }}
                  />
                  {cfg.label}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Scatter chart: NDCG vs Latency */}
      {scatterData.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Quality vs Latency (per query)</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={scatterConfig} className="h-[180px]">
              <ScatterChart margin={{ top: 8, right: 8, bottom: 4, left: -20 }}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border)"
                />
                <XAxis
                  type="number"
                  dataKey="x"
                  name="Latency (ms)"
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                  label={{
                    value: "Latency (ms)",
                    position: "insideBottomRight",
                    offset: -4,
                    fontSize: 10,
                    fill: "var(--muted-foreground)",
                  }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  name="NDCG (%)"
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                />
                <ZAxis type="number" dataKey="z" range={[30, 30]} />
                <Tooltip
                  cursor={{ strokeDasharray: "3 3" }}
                  content={({ payload }) => {
                    if (!payload?.length) return null
                    const pt = payload[0].payload as { x: number; y: number; query: string }
                    return (
                      <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-md text-xs space-y-1">
                        <p className="text-muted-foreground truncate max-w-48">{pt.query}</p>
                        <p className="text-foreground">Latency: <span className="font-mono">{pt.x} ms</span></p>
                        <p className="text-foreground">NDCG: <span className="font-mono">{pt.y}%</span></p>
                      </div>
                    )
                  }}
                />
                <Scatter
                  data={scatterData}
                  fill="var(--color-query)"
                  fillOpacity={0.7}
                />
              </ScatterChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {/* Per-query results table */}
      {resultsLoading && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      )}

      {results && results.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm">Per-Query Results</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportToCSV(results, id!)}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Export CSV
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Query</TableHead>
                  <TableHead className="tabular-nums">NDCG</TableHead>
                  <TableHead className="tabular-nums">Recall@K</TableHead>
                  <TableHead className="tabular-nums">Precision@K</TableHead>
                  <TableHead className="tabular-nums">Latency</TableHead>
                  <TableHead>Returned</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((r) => (
                  <TableRow key={r.id} className="hover:bg-muted/50">
                    <TableCell className="max-w-56 truncate text-sm">
                      {r.query_text}
                    </TableCell>
                    <TableCell>
                      <MetricValue value={r.ndcg} />
                    </TableCell>
                    <TableCell>
                      <MetricValue value={r.recall_at_k} />
                    </TableCell>
                    <TableCell>
                      <MetricValue value={r.precision_at_k} />
                    </TableCell>
                    <TableCell className="tabular-nums text-xs text-muted-foreground">
                      {r.latency_ms != null ? `${r.latency_ms.toFixed(1)} ms` : "-"}
                    </TableCell>
                    <TableCell className="tabular-nums text-sm">
                      {r.returned_ids.length}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {run.status === "running" && (
        <div className="flex items-center justify-center rounded-lg border border-dashed py-8 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Evaluation is running… results will appear when complete
        </div>
      )}

      {run.status === "pending" && (
        <div className="flex items-center justify-center rounded-lg border border-dashed py-8 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Evaluation is queued…
        </div>
      )}
    </div>
  )
}

// ---- Sub-components ----

function MetricCard({
  label,
  value,
  total,
}: {
  label: string
  value: number
  total: number
}) {
  const pct = (value * 100).toFixed(1)
  const colorClass =
    value >= 0.8
      ? "text-green-400"
      : value >= 0.5
        ? "text-yellow-400"
        : "text-red-400"
  const barClass =
    value >= 0.8
      ? "bg-green-500"
      : value >= 0.5
        ? "bg-yellow-500"
        : "bg-red-500"

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Avg {label}</CardTitle>
        <Target className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className={cn("text-3xl font-bold tabular-nums", colorClass)}>
          {pct}%
        </div>
        <p className="text-xs text-muted-foreground">{total} queries</p>
        <div className="mt-2 h-1.5 rounded-full bg-muted">
          <div
            className={cn("h-1.5 rounded-full transition-all", barClass)}
            style={{ width: `${Math.min(value * 100, 100)}%` }}
          />
        </div>
      </CardContent>
    </Card>
  )
}

function MetricValue({ value }: { value: number | null }) {
  if (value === null || value === undefined)
    return <span className="text-muted-foreground text-xs">—</span>
  const pct = (value * 100).toFixed(1)
  const color =
    value >= 0.8
      ? "text-green-400"
      : value >= 0.5
        ? "text-yellow-400"
        : "text-red-400"
  return <span className={cn("font-mono text-xs font-medium", color)}>{pct}%</span>
}

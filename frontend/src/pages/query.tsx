import { useState, useEffect } from "react"
import { useQuery, useMutation } from "@tanstack/react-query"
import { useSearchParams } from "react-router-dom"
import {
  Search,
  Loader2,
  Download,
  History,
  ChevronDown,
  ChevronUp,
} from "lucide-react"
import type { QueryResponse, CollectionListResponse } from "@/lib/api-client"
import { queryApi, collectionApi } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

interface QueryHistoryItem {
  query_text: string
  collection: string
  federated: boolean
  timestamp: number
}

function getQueryHistory(): QueryHistoryItem[] {
  try {
    return JSON.parse(localStorage.getItem("vh_query_history") || "[]")
  } catch {
    return []
  }
}

function addQueryHistory(item: QueryHistoryItem) {
  const history = getQueryHistory().slice(0, 19)
  history.unshift(item)
  localStorage.setItem("vh_query_history", JSON.stringify(history))
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  return `${Math.floor(m / 60)}h ago`
}

export default function QueryPage() {
  const [searchParams] = useSearchParams()
  const [queryText, setQueryText] = useState("")
  const [collection, setCollection] = useState(searchParams.get("collection") ?? "")
  const [topK, setTopK] = useState("10")
  const [federated, setFederated] = useState(false)
  const [searchType, setSearchType] = useState("dense")
  const [result, setResult] = useState<QueryResponse | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)

  const queryHistory = getQueryHistory()

  // Sync URL param on mount (for deep-linking from collections page)
  useEffect(() => {
    const c = searchParams.get("collection")
    if (c) setCollection(c)
  }, [searchParams])

  const { data: collData } = useQuery<CollectionListResponse>({
    queryKey: ["collections"],
    queryFn: collectionApi.list,
  })

  const queryMutation = useMutation({
    mutationFn: async () => {
      const params = {
        query_text: queryText,
        top_k: parseInt(topK) || 10,
        search_type: searchType,
      }
      const res = federated
        ? await queryApi.queryFederated(params)
        : await queryApi.queryCollection(collection, params)
      addQueryHistory({ query_text: queryText, collection, federated, timestamp: Date.now() })
      return res
    },
    onSuccess: (data) => setResult(data),
  })

  const collections = collData?.collections ?? []

  const exportResults = () => {
    if (!result) return
    const blob = new Blob([JSON.stringify(result, null, 2)], {
      type: "application/json",
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `query-results-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Query Playground</h1>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Input panel */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Query Parameters</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="federated" className="cursor-pointer">
                  Federated Query
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    (all stores)
                  </span>
                </Label>
                <Switch
                  id="federated"
                  checked={federated}
                  onCheckedChange={setFederated}
                />
              </div>

              {!federated && (
                <div className="space-y-1.5">
                  <Label>Collection</Label>
                  <Select value={collection} onValueChange={setCollection}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select collection" />
                    </SelectTrigger>
                    <SelectContent>
                      {collections.map((c) => (
                        <SelectItem key={c.name} value={c.name}>
                          {c.name}
                          <span className="ml-1.5 text-xs text-muted-foreground">
                            ({c.store_type})
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-1.5">
                <Label>Query Text</Label>
                <Textarea
                  value={queryText}
                  onChange={(e) => setQueryText(e.target.value)}
                  placeholder="Enter your search query…"
                  rows={3}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault()
                      if (queryText && (federated || collection) && !queryMutation.isPending) {
                        queryMutation.mutate()
                      }
                    }
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  ⌘ Enter to run
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Top K</Label>
                  <Input
                    type="number"
                    value={topK}
                    onChange={(e) => setTopK(e.target.value)}
                    min={1}
                    max={100}
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

              <Button
                className="w-full"
                onClick={() => queryMutation.mutate()}
                disabled={
                  !queryText ||
                  (!federated && !collection) ||
                  queryMutation.isPending
                }
              >
                {queryMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Running…
                  </>
                ) : (
                  <>
                    <Search className="mr-2 h-4 w-4" />
                    Run Query
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Query History */}
          {queryHistory.length > 0 && (
            <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-between text-muted-foreground"
                >
                  <span className="flex items-center gap-1.5">
                    <History className="h-3.5 w-3.5" />
                    Recent Queries
                    <Badge variant="secondary" className="text-xs">
                      {queryHistory.length}
                    </Badge>
                  </span>
                  {historyOpen ? (
                    <ChevronUp className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-1 space-y-1">
                  {queryHistory.slice(0, 8).map((item, idx) => (
                    <button
                      key={idx}
                      className="w-full rounded-md border border-border px-3 py-2 text-left hover:bg-muted/50 transition-colors"
                      onClick={() => {
                        setQueryText(item.query_text)
                        if (item.collection) setCollection(item.collection)
                        setFederated(item.federated)
                      }}
                    >
                      <p className="truncate text-xs font-medium">{item.query_text}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {item.federated ? "Federated" : item.collection} ·{" "}
                        {relativeTime(item.timestamp)}
                      </p>
                    </button>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>

        {/* Results panel */}
        <div className="space-y-4">
          {queryMutation.isError && (
            <div className="rounded-md bg-red-500/10 border border-red-800 p-4 text-sm text-red-400">
              {(queryMutation.error as Error).message}
            </div>
          )}

          {result && (
            <>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
                  <span className="font-medium text-foreground tabular-nums">
                    {result.total}
                  </span>
                  <span>results</span>
                  <span className="text-border">·</span>
                  <span className="tabular-nums">{result.latency_ms.toFixed(1)} ms</span>
                  {result.stores_queried.length > 0 && (
                    <>
                      <span className="text-border">·</span>
                      <div className="flex gap-1 flex-wrap">
                        {result.stores_queried.map((s) => (
                          <Badge key={s} variant="outline" className="text-xs">
                            {s}
                          </Badge>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                <Button variant="ghost" size="sm" onClick={exportResults}>
                  <Download className="mr-1 h-3 w-3" />
                  Export JSON
                </Button>
              </div>

              <div className="space-y-3">
                {result.results.map((r, idx) => (
                  <ResultCard key={r.id} rank={idx + 1} result={r} />
                ))}
              </div>
            </>
          )}

          {queryMutation.isPending && (
            <div className="flex items-center justify-center rounded-lg border border-dashed py-16 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Running query…
            </div>
          )}

          {!result && !queryMutation.isPending && (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
              <Search className="mb-3 h-10 w-10 text-muted-foreground/30" />
              <p className="text-sm font-medium">No results yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {federated
                  ? "Enter a query to search all vector stores"
                  : collection
                    ? `Enter a query to search "${collection}"`
                    : "Select a collection and enter a query"}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ---- Result Card ----

function ResultCard({
  rank,
  result,
}: {
  rank: number
  result: {
    id: string
    score: number
    metadata: Record<string, unknown>
    text: string | null
    store_type: string
  }
}) {
  const [expanded, setExpanded] = useState(false)
  const scorePct = Math.min(result.score * 100, 100)

  const scoreColor =
    scorePct >= 80
      ? "bg-green-500/10 text-green-400 border-green-800"
      : scorePct >= 50
        ? "bg-yellow-500/10 text-yellow-400 border-yellow-800"
        : "bg-red-500/10 text-red-400 border-red-800"

  const indicatorClass =
    scorePct >= 80
      ? "[&_[data-slot=progress-indicator]]:bg-green-500"
      : scorePct >= 50
        ? "[&_[data-slot=progress-indicator]]:bg-yellow-500"
        : "[&_[data-slot=progress-indicator]]:bg-red-500"

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium tabular-nums">
            {rank}
          </span>
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs text-muted-foreground truncate flex-1 min-w-0">
                {result.id}
              </span>
              {result.store_type && (
                <Badge variant="outline" className="text-xs shrink-0">
                  {result.store_type}
                </Badge>
              )}
              <Badge variant="outline" className={cn("text-xs font-mono shrink-0", scoreColor)}>
                {scorePct.toFixed(1)}%
              </Badge>
            </div>

            {/* Score bar */}
            <Progress value={scorePct} className={cn("h-1", indicatorClass)} />

            {result.text && (
              <p className="line-clamp-2 text-sm text-muted-foreground">
                {result.text}
              </p>
            )}

            {Object.keys(result.metadata).length > 0 && (
              <Collapsible open={expanded} onOpenChange={setExpanded}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
                    {expanded ? <ChevronUp className="mr-1 h-3 w-3" /> : <ChevronDown className="mr-1 h-3 w-3" />}
                    {expanded ? "Hide" : "Show"} metadata
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <pre className="mt-1.5 overflow-auto rounded-md bg-zinc-900 p-2.5 font-mono text-xs max-h-36 text-zinc-300">
                    {JSON.stringify(result.metadata, null, 2)}
                  </pre>
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

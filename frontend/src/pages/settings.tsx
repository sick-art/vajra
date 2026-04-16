import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Loader2, Check, ArrowRightLeft, Eye, Cpu, Scissors, Activity } from "lucide-react"
import type { ModelListResponse, ChunkStrategy, ChunkPreviewResponse } from "@/lib/api-client"
import { settingsApi } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { ConnectionStatus } from "@/components/connection-status"
import { cn } from "@/lib/utils"

const CHUNK_COLORS = [
  "border-violet-800 bg-violet-500/10",
  "border-blue-800 bg-blue-500/10",
  "border-green-800 bg-green-500/10",
  "border-amber-800 bg-amber-500/10",
  "border-red-800 bg-red-500/10",
]

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      <Tabs defaultValue="models">
        <TabsList>
          <TabsTrigger value="models">
            <Cpu className="mr-1.5 h-3.5 w-3.5" />
            Embedding Models
          </TabsTrigger>
          <TabsTrigger value="chunking">
            <Scissors className="mr-1.5 h-3.5 w-3.5" />
            Chunking
          </TabsTrigger>
          <TabsTrigger value="system">
            <Activity className="mr-1.5 h-3.5 w-3.5" />
            System
          </TabsTrigger>
        </TabsList>

        <TabsContent value="models" className="mt-4">
          <ModelsTab />
        </TabsContent>
        <TabsContent value="chunking" className="mt-4">
          <ChunkingTab />
        </TabsContent>
        <TabsContent value="system" className="mt-4">
          <SystemTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ---- Models Tab ----

function ModelsTab() {
  const queryClient = useQueryClient()
  const [confirmModel, setConfirmModel] = useState<string | null>(null)

  const { data, isLoading } = useQuery<ModelListResponse>({
    queryKey: ["models"],
    queryFn: settingsApi.listModels,
  })

  const switchMutation = useMutation({
    mutationFn: (name: string) => settingsApi.switchModel(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["models"] })
      setConfirmModel(null)
    },
  })

  if (isLoading) {
    return (
      <div className="grid gap-3 md:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    )
  }

  const models = data?.models ?? []
  const activeModel = data?.active_model ?? ""

  return (
    <>
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-sm">Embedding Models</CardTitle>
          <CardDescription>
            Switch the active model used for all embedding operations. Changing models
            requires re-indexing collections with different dimensions.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        {models.map((model) => {
          const isActive = model.name === activeModel
          return (
            <div
              key={model.name}
              className={cn(
                "rounded-lg border p-4 transition-colors",
                isActive
                  ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20"
                  : "border-border bg-card hover:border-border/60",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-sm font-semibold truncate">
                    {model.name.split("/").pop()}
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-muted-foreground truncate">
                    {model.name}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <Badge variant="outline" className="text-xs tabular-nums">
                      {model.dimensions}d
                    </Badge>
                    {isActive && (
                      <Badge
                        variant="outline"
                        className="bg-green-500/10 text-green-400 border-green-800 text-xs"
                      >
                        <Check className="mr-1 h-2.5 w-2.5" />
                        Active
                      </Badge>
                    )}
                    {!model.is_loaded && !isActive && (
                      <Badge variant="outline" className="text-xs text-muted-foreground">
                        Not loaded
                      </Badge>
                    )}
                  </div>
                </div>
                {!isActive && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => setConfirmModel(model.name)}
                  >
                    <ArrowRightLeft className="mr-1 h-3 w-3" />
                    Switch
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Confirm switch dialog */}
      <Dialog
        open={!!confirmModel}
        onOpenChange={(open) => !open && setConfirmModel(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Switch Embedding Model?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Switch to{" "}
            <span className="font-mono text-foreground">{confirmModel}</span>?
            Collections indexed with a different dimension count will become
            incompatible until re-indexed.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setConfirmModel(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => confirmModel && switchMutation.mutate(confirmModel)}
              disabled={switchMutation.isPending}
            >
              {switchMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Switch Model
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ---- Chunking Tab ----

function ChunkingTab() {
  const [strategy, setStrategy] = useState("none")
  const [chunkSize, setChunkSize] = useState("512")
  const [chunkOverlap, setChunkOverlap] = useState("50")
  const [sampleText, setSampleText] = useState(
    "This is a sample document that will be chunked using the selected strategy. " +
      "You can replace this text with your own content to preview how chunking works. " +
      "Different strategies will split the text differently based on the configuration parameters.",
  )
  const [preview, setPreview] = useState<ChunkPreviewResponse | null>(null)

  const { data: strategies } = useQuery<ChunkStrategy[]>({
    queryKey: ["chunking-strategies"],
    queryFn: settingsApi.listChunkingStrategies,
  })

  const previewMutation = useMutation({
    mutationFn: () =>
      settingsApi.previewChunking(sampleText, {
        strategy,
        chunk_size: parseInt(chunkSize) || 512,
        chunk_overlap: parseInt(chunkOverlap) || 50,
      }),
    onSuccess: setPreview,
  })

  const defaultStrategies = [
    { id: "none",      name: "None",      description: "No chunking — ingest as-is" },
    { id: "fixed_size",name: "Fixed Size",description: "Fixed character-count chunks" },
    { id: "sentence",  name: "Sentence",  description: "Split on sentence boundaries" },
    { id: "paragraph", name: "Paragraph", description: "Split on paragraph breaks" },
    { id: "recursive", name: "Recursive", description: "Recursive character splitting" },
  ]

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Chunk Configuration</CardTitle>
          <CardDescription>
            Preview how text will be split before ingestion
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Strategy</Label>
            <Select value={strategy} onValueChange={setStrategy}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(strategies ?? defaultStrategies).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      — {s.description}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Chunk Size</Label>
              <Input
                type="number"
                value={chunkSize}
                onChange={(e) => setChunkSize(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Overlap</Label>
              <Input
                type="number"
                value={chunkOverlap}
                onChange={(e) => setChunkOverlap(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Sample Text</Label>
            <Textarea
              value={sampleText}
              onChange={(e) => setSampleText(e.target.value)}
              rows={5}
              className="text-sm"
            />
          </div>

          <Button
            className="w-full"
            onClick={() => previewMutation.mutate()}
            disabled={previewMutation.isPending}
          >
            {previewMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Eye className="mr-2 h-4 w-4" />
                Preview Chunks
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            Preview
            {preview && (
              <span className="ml-2 font-normal text-muted-foreground">
                {preview.chunk_count} chunks · {preview.total_chars} chars
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!preview ? (
            <div className="flex flex-col items-center rounded-lg border border-dashed py-10 text-center">
              <Scissors className="mb-3 h-7 w-7 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                Configure and click Preview Chunks
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
              {preview.chunks.map((chunk, idx) => (
                <div
                  key={idx}
                  className={cn(
                    "rounded-md border p-3",
                    CHUNK_COLORS[idx % CHUNK_COLORS.length],
                  )}
                >
                  <div className="mb-1.5 flex items-center gap-2">
                    <Badge variant="outline" className="text-xs tabular-nums">
                      #{idx + 1}
                    </Badge>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {chunk.length} chars
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed">{chunk}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ---- System Tab ----

function SystemTab() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">System Health</CardTitle>
        <CardDescription>
          Live status of all connected infrastructure components
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <ConnectionStatus className="gap-2" />
        </div>
        <SystemHealthDetail />
      </CardContent>
    </Card>
  )
}

function SystemHealthDetail() {
  const { data: health, isLoading } = useQuery({
    queryKey: ["health"],
    queryFn: settingsApi.listModels.bind(null) as never,
    enabled: false, // ConnectionStatus handles the query
  })

  // Re-use the health query that ConnectionStatus already fetches
  const { data: healthData } = useQuery({
    queryKey: ["health"],
  }) as { data: { status: string; components: Record<string, { status: string }> } | undefined }

  if (!healthData) {
    return isLoading ? (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-12" />
        ))}
      </div>
    ) : null
  }

  return (
    <div className="grid gap-2 md:grid-cols-2">
      {Object.entries(healthData.components).map(([name, info]) => (
        <div
          key={name}
          className="flex items-center justify-between rounded-md border border-border p-3"
        >
          <span className="text-sm font-medium capitalize">{name}</span>
          <Badge
            variant="outline"
            className={
              info.status === "ok"
                ? "bg-green-500/10 text-green-400 border-green-800"
                : "bg-red-500/10 text-red-400 border-red-800"
            }
          >
            {info.status}
          </Badge>
        </div>
      ))}
    </div>
  )
}

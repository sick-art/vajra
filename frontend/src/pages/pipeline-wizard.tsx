import { useState, useRef, useCallback } from "react"
import { useQuery, useMutation } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileText,
  Loader2,
  Play,
  Plus,
  Trash2,
  Upload,
  Zap,
  BookTemplate,
  AlertTriangle,
} from "lucide-react"
import type {
  ModelListResponse,
  ChunkStrategy,
  CollectionListResponse,
  CollectionInfo,
} from "@/lib/api-client"
import {
  settingsApi,
  collectionApi,
  ingestApi,
} from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

// ---- Types ----

interface PipelineConfig {
  sourceType: "file" | "text"
  files: File[]
  rawText: string
  embeddingModel: string   // "active" = use current
  chunkStrategy: string
  chunkSize: number
  chunkOverlap: number
  collectionMode: "existing" | "new"
  collection: string
  storeType: string
  newCollectionDimensions: number
  pipelineName: string
}

interface PipelineTemplate {
  id: string
  name: string
  config: Omit<PipelineConfig, "files" | "rawText">
  createdAt: number
}

// ---- localStorage helpers ----

const TEMPLATES_KEY = "vh_pipeline_templates"

function loadTemplates(): PipelineTemplate[] {
  try {
    return JSON.parse(localStorage.getItem(TEMPLATES_KEY) || "[]")
  } catch {
    return []
  }
}

function saveTemplate(tpl: PipelineTemplate) {
  const templates = loadTemplates().filter((t) => t.id !== tpl.id)
  templates.unshift(tpl)
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates.slice(0, 20)))
}

function deleteTemplate(id: string) {
  const templates = loadTemplates().filter((t) => t.id !== id)
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates))
}

// ---- Chunk helpers ----

function previewChunks(text: string, size: number, overlap: number): string[] {
  if (!text || size <= 0) return text ? [text] : []
  const chunks: string[] = []
  let i = 0
  while (i < text.length) {
    chunks.push(text.slice(i, i + size))
    i += Math.max(size - overlap, 1)
  }
  return chunks
}

function buildRecords(
  text: string,
  chunkSize: number,
  chunkOverlap: number,
  sourceName: string,
) {
  const chunks = previewChunks(text, chunkSize, chunkOverlap)
  return chunks.map((chunk, idx) => ({
    id: `${sourceName.replace(/\s+/g, "-")}-${idx}-${Date.now()}`,
    text: chunk,
    metadata: {
      source: sourceName,
      chunk_index: idx,
      total_chunks: chunks.length,
    },
  }))
}

async function readFileAsText(file: File): Promise<string> {
  if (
    file.type === "text/plain" ||
    file.name.endsWith(".md") ||
    file.name.endsWith(".txt")
  ) {
    return file.text()
  }
  // PDF/DOCX: placeholder — extraction happens server-side
  return `[Binary file: ${file.name} (${(file.size / 1024).toFixed(1)} KB) — text will be extracted during ingestion]`
}

// ---- Chunk colors ----

const CHUNK_COLORS = [
  "border-violet-800 bg-violet-500/10",
  "border-blue-800 bg-blue-500/10",
  "border-green-800 bg-green-500/10",
  "border-amber-800 bg-amber-500/10",
  "border-red-800 bg-red-500/10",
]

// ---- Step indicator ----

const STEP_LABELS = ["Data Source", "Embedding", "Chunking", "Target", "Review"]

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-between mb-8">
      {STEP_LABELS.map((label, idx) => {
        const stepNum = idx + 1
        const done = stepNum < current
        const active = stepNum === current
        return (
          <div key={label} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors",
                  done
                    ? "bg-primary text-primary-foreground"
                    : active
                      ? "bg-primary text-primary-foreground ring-2 ring-primary/30"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {done ? <Check className="h-4 w-4" /> : stepNum}
              </div>
              <span
                className={cn(
                  "mt-1.5 text-xs font-medium whitespace-nowrap",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                {label}
              </span>
            </div>
            {idx < STEP_LABELS.length - 1 && (
              <div
                className={cn(
                  "mx-2 mb-5 h-px flex-1 min-w-6",
                  done ? "bg-primary" : "bg-border",
                )}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ---- Default config ----

const DEFAULT_CONFIG: PipelineConfig = {
  sourceType: "text",
  files: [],
  rawText: "",
  embeddingModel: "active",
  chunkStrategy: "fixed_size",
  chunkSize: 512,
  chunkOverlap: 50,
  collectionMode: "existing",
  collection: "",
  storeType: "lancedb",
  newCollectionDimensions: 384,
  pipelineName: `Pipeline ${new Date().toISOString().slice(0, 10)}`,
}

// ======== Main Page ========

export default function PipelineWizardPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [config, setConfig] = useState<PipelineConfig>(DEFAULT_CONFIG)
  const [error, setError] = useState("")

  const update = (partial: Partial<PipelineConfig>) =>
    setConfig((c) => ({ ...c, ...partial }))

  const canAdvance = (): boolean => {
    if (step === 1) {
      return config.sourceType === "file"
        ? config.files.length > 0
        : config.rawText.trim().length > 0
    }
    if (step === 2) return !!config.embeddingModel
    if (step === 3) return config.chunkSize > 0
    if (step === 4) {
      return config.collectionMode === "existing"
        ? !!config.collection
        : !!config.pipelineName
    }
    return true
  }

  function prev() { setStep((s) => Math.max(1, s - 1)) }
  function next() {
    if (canAdvance()) setStep((s) => Math.min(5, s + 1))
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          Pipeline Wizard
        </h1>
      </div>

      <StepIndicator current={step} />

      {error && (
        <div className="rounded-md bg-red-500/10 border border-red-800 p-3 text-sm text-red-400 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {step === 1 && <Step1DataSource config={config} update={update} />}
      {step === 2 && <Step2Embedding config={config} update={update} />}
      {step === 3 && <Step3Chunking config={config} update={update} />}
      {step === 4 && <Step4Target config={config} update={update} />}
      {step === 5 && (
        <Step5Review
          config={config}
          update={update}
          onError={setError}
          onSuccess={(wfId) => navigate(`/workflows/${wfId}`)}
        />
      )}

      {/* Nav buttons */}
      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={prev} disabled={step === 1}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back
        </Button>
        {step < 5 && (
          <Button onClick={next} disabled={!canAdvance()}>
            Next
            <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )
}

// ======== Step 1 — Data Source ========

function Step1DataSource({
  config,
  update,
}: {
  config: PipelineConfig
  update: (p: Partial<PipelineConfig>) => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const addFiles = useCallback(
    (incoming: FileList | null) => {
      if (!incoming) return
      const allowed = Array.from(incoming).filter((f) =>
        /\.(pdf|txt|docx|md)$/i.test(f.name),
      )
      update({ files: [...config.files, ...allowed] })
    },
    [config.files, update],
  )

  const removeFile = (idx: number) => {
    update({ files: config.files.filter((_, i) => i !== idx) })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Data Source</CardTitle>
        <CardDescription>
          Choose how to provide the text content for this pipeline run
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex gap-3">
          <button
            onClick={() => update({ sourceType: "file" })}
            className={cn(
              "flex-1 rounded-lg border p-3 text-left text-sm font-medium transition-colors",
              config.sourceType === "file"
                ? "border-primary/50 bg-primary/5 text-primary"
                : "border-border hover:border-border/60",
            )}
          >
            <Upload className="mb-1 h-5 w-5" />
            Upload Files
            <p className="mt-0.5 text-xs font-normal text-muted-foreground">
              PDF, TXT, DOCX, Markdown
            </p>
          </button>
          <button
            onClick={() => update({ sourceType: "text" })}
            className={cn(
              "flex-1 rounded-lg border p-3 text-left text-sm font-medium transition-colors",
              config.sourceType === "text"
                ? "border-primary/50 bg-primary/5 text-primary"
                : "border-border hover:border-border/60",
            )}
          >
            <FileText className="mb-1 h-5 w-5" />
            Paste Text
            <p className="mt-0.5 text-xs font-normal text-muted-foreground">
              Any raw text content
            </p>
          </button>
        </div>

        {config.sourceType === "file" ? (
          <div className="space-y-3">
            <div
              className={cn(
                "rounded-lg border-2 border-dashed p-8 text-center transition-colors cursor-pointer",
                dragging
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50",
              )}
              onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragging(false)
                addFiles(e.dataTransfer.files)
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm font-medium">Drop files here or click to browse</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Supported: .pdf · .txt · .docx · .md
              </p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.txt,.docx,.md"
                className="sr-only"
                onChange={(e) => addFiles(e.target.files)}
              />
            </div>

            {config.files.length > 0 && (
              <div className="space-y-1.5">
                {config.files.map((file, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-sm truncate">{file.name}</span>
                      <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                        {(file.size / 1024).toFixed(1)} KB
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-red-400"
                      onClick={() => removeFile(idx)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Text Content</Label>
              <span className="text-xs text-muted-foreground tabular-nums">
                {config.rawText.length.toLocaleString()} chars
              </span>
            </div>
            <Textarea
              value={config.rawText}
              onChange={(e) => update({ rawText: e.target.value })}
              placeholder="Paste your document content here…"
              rows={12}
              className="font-mono text-xs resize-none"
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ======== Step 2 — Embedding Model ========

function Step2Embedding({
  config,
  update,
}: {
  config: PipelineConfig
  update: (p: Partial<PipelineConfig>) => void
}) {
  const { data, isLoading } = useQuery<ModelListResponse>({
    queryKey: ["models"],
    queryFn: settingsApi.listModels,
  })

  const models = data?.models ?? []
  const activeModel = data?.active_model ?? ""

  const selected =
    config.embeddingModel === "active" ? activeModel : config.embeddingModel
  const selectedDims =
    models.find((m) => m.name === selected)?.dimensions ?? 384

  return (
    <Card>
      <CardHeader>
        <CardTitle>Embedding Model</CardTitle>
        <CardDescription>
          Select the model used to convert text chunks into vectors.
          Must match the target collection's dimensions.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading models…
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {/* Active model option */}
            <div
              className={cn(
                "rounded-lg border p-4 cursor-pointer transition-colors",
                config.embeddingModel === "active"
                  ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20"
                  : "border-border hover:border-border/60",
              )}
              onClick={() => update({ embeddingModel: "active" })}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-mono text-sm font-semibold">
                    {activeModel.split("/").pop()}
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-muted-foreground truncate max-w-36">
                    {activeModel}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <Badge variant="outline" className="text-xs tabular-nums">
                      {models.find((m) => m.name === activeModel)?.dimensions ?? "?"}d
                    </Badge>
                    <Badge
                      variant="outline"
                      className="bg-green-500/10 text-green-400 border-green-800 text-xs"
                    >
                      Active
                    </Badge>
                  </div>
                </div>
                {config.embeddingModel === "active" && (
                  <Check className="h-4 w-4 text-primary mt-0.5" />
                )}
              </div>
            </div>

            {models
              .filter((m) => m.name !== activeModel)
              .map((model) => (
                <div
                  key={model.name}
                  className={cn(
                    "rounded-lg border p-4 cursor-pointer transition-colors",
                    config.embeddingModel === model.name
                      ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20"
                      : "border-border hover:border-border/60",
                  )}
                  onClick={() => update({ embeddingModel: model.name })}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-mono text-sm font-semibold">
                        {model.name.split("/").pop()}
                      </p>
                      <p className="mt-0.5 font-mono text-xs text-muted-foreground truncate max-w-36">
                        {model.name}
                      </p>
                      <Badge variant="outline" className="mt-2 text-xs tabular-nums">
                        {model.dimensions}d
                      </Badge>
                    </div>
                    {config.embeddingModel === model.name && (
                      <Check className="h-4 w-4 text-primary mt-0.5" />
                    )}
                  </div>
                </div>
              ))}
          </div>
        )}

        {selectedDims && (
          <p className="mt-4 text-xs text-muted-foreground">
            Selected model produces{" "}
            <span className="font-mono text-foreground">{selectedDims}</span>-dimensional
            vectors. Your target collection must have matching dimensions.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// ======== Step 3 — Chunk Strategy ========

function Step3Chunking({
  config,
  update,
}: {
  config: PipelineConfig
  update: (p: Partial<PipelineConfig>) => void
}) {
  const [previewChunkList, setPreviewChunkList] = useState<string[]>([])
  const [previewing, setPreviewing] = useState(false)

  const { data: strategies } = useQuery<ChunkStrategy[]>({
    queryKey: ["chunking-strategies"],
    queryFn: settingsApi.listChunkingStrategies,
  })

  const defaultStrategies = [
    { id: "none",       name: "None",       description: "Ingest as-is" },
    { id: "fixed_size", name: "Fixed Size", description: "Fixed character chunks" },
    { id: "sentence",   name: "Sentence",   description: "Sentence boundaries" },
    { id: "paragraph",  name: "Paragraph",  description: "Paragraph breaks" },
    { id: "recursive",  name: "Recursive",  description: "Recursive splitting" },
  ]

  async function handlePreview() {
    setPreviewing(true)
    const text =
      config.sourceType === "text"
        ? config.rawText.slice(0, 1000)
        : config.files.length > 0
          ? (await readFileAsText(config.files[0])).slice(0, 1000)
          : "No text available for preview."

    try {
      const resp = await settingsApi.previewChunking(text, {
        strategy: config.chunkStrategy,
        chunk_size: config.chunkSize,
        chunk_overlap: config.chunkOverlap,
      })
      setPreviewChunkList(resp.chunks)
    } catch {
      // fallback to client-side preview
      setPreviewChunkList(previewChunks(text, config.chunkSize, config.chunkOverlap))
    } finally {
      setPreviewing(false)
    }
  }

  const estChunks =
    config.sourceType === "text"
      ? Math.ceil(config.rawText.length / Math.max(config.chunkSize - config.chunkOverlap, 1))
      : config.files.reduce(
          (acc, f) => acc + Math.ceil(f.size / Math.max(config.chunkSize, 1)),
          0,
        )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Chunk Strategy</CardTitle>
        <CardDescription>
          Configure how documents are split before embedding
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-1.5">
          <Label>Strategy</Label>
          <Select
            value={config.chunkStrategy}
            onValueChange={(v) => update({ chunkStrategy: v })}
          >
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
            <Label>Chunk Size (chars)</Label>
            <Input
              type="number"
              value={config.chunkSize}
              onChange={(e) => update({ chunkSize: parseInt(e.target.value) || 512 })}
              min={50}
              max={8000}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Overlap (chars)</Label>
            <Input
              type="number"
              value={config.chunkOverlap}
              onChange={(e) => update({ chunkOverlap: parseInt(e.target.value) || 0 })}
              min={0}
              max={config.chunkSize - 1}
            />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-md border border-border bg-muted/50 px-3 py-2">
          <span className="text-sm text-muted-foreground">
            Estimated chunks from input:
          </span>
          <span className="font-mono text-sm font-semibold tabular-nums">
            ~{estChunks.toLocaleString()}
          </span>
        </div>

        <Button
          variant="outline"
          className="w-full"
          onClick={handlePreview}
          disabled={
            previewing ||
            (config.sourceType === "text" && !config.rawText) ||
            (config.sourceType === "file" && !config.files.length)
          }
        >
          {previewing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Previewing…
            </>
          ) : (
            "Preview First 1000 Chars"
          )}
        </Button>

        {previewChunkList.length > 0 && (
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            <p className="text-xs text-muted-foreground">
              {previewChunkList.length} chunks from first 1000 chars:
            </p>
            {previewChunkList.map((chunk, idx) => (
              <div
                key={idx}
                className={cn(
                  "rounded-md border p-2.5 text-xs",
                  CHUNK_COLORS[idx % CHUNK_COLORS.length],
                )}
              >
                <div className="mb-1 flex items-center gap-1.5">
                  <Badge variant="outline" className="text-xs tabular-nums py-0">
                    #{idx + 1}
                  </Badge>
                  <span className="text-muted-foreground tabular-nums">
                    {chunk.length} chars
                  </span>
                </div>
                <p className="line-clamp-2 leading-relaxed">{chunk}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ======== Step 4 — Target Collection ========

function Step4Target({
  config,
  update,
}: {
  config: PipelineConfig
  update: (p: Partial<PipelineConfig>) => void
}) {
  const { data: collData } = useQuery<CollectionListResponse>({
    queryKey: ["collections"],
    queryFn: collectionApi.list,
  })

  const collections = collData?.collections ?? []
  const selectedColl = collections.find((c) => c.name === config.collection)
  const modelDims = 384 // approximate; real check is in Step 2

  function getDimsMismatch(coll: CollectionInfo): boolean {
    return coll.dimensions !== modelDims
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Target Vector Store</CardTitle>
        <CardDescription>
          Choose where to store the generated embeddings
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex gap-3">
          <button
            onClick={() => update({ collectionMode: "existing" })}
            className={cn(
              "flex-1 rounded-lg border p-3 text-left text-sm font-medium transition-colors",
              config.collectionMode === "existing"
                ? "border-primary/50 bg-primary/5 text-primary"
                : "border-border hover:border-border/60",
            )}
          >
            <Check className="mb-1 h-4 w-4" />
            Use Existing
          </button>
          <button
            onClick={() => update({ collectionMode: "new" })}
            className={cn(
              "flex-1 rounded-lg border p-3 text-left text-sm font-medium transition-colors",
              config.collectionMode === "new"
                ? "border-primary/50 bg-primary/5 text-primary"
                : "border-border hover:border-border/60",
            )}
          >
            <Plus className="mb-1 h-4 w-4" />
            Create New
          </button>
        </div>

        {config.collectionMode === "existing" ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Collection</Label>
              <Select
                value={config.collection}
                onValueChange={(v) => {
                  const coll = collections.find((c) => c.name === v)
                  update({
                    collection: v,
                    storeType: coll?.store_type ?? "lancedb",
                  })
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a collection…" />
                </SelectTrigger>
                <SelectContent>
                  {collections.map((c) => (
                    <SelectItem key={c.name} value={c.name}>
                      {c.name}
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        ({c.store_type} · {c.dimensions}d · {c.vector_count} vecs)
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedColl && (
              <div className="rounded-md border border-border bg-muted/50 p-3 text-sm">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Store Type</p>
                    <p className="font-medium">{selectedColl.store_type}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Dimensions</p>
                    <p className="font-mono font-medium tabular-nums">
                      {selectedColl.dimensions}d
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Vectors</p>
                    <p className="font-mono font-medium tabular-nums">
                      {selectedColl.vector_count.toLocaleString()}
                    </p>
                  </div>
                </div>
                {getDimsMismatch(selectedColl) && (
                  <div className="mt-3 flex items-center gap-2 text-xs text-yellow-400">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    Dimension mismatch: collection is {selectedColl.dimensions}d but
                    selected model outputs {modelDims}d — ingestion may fail
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Collection Name</Label>
              <Input
                value={config.collection}
                onChange={(e) => update({ collection: e.target.value })}
                placeholder="my-new-collection"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Store Type</Label>
              <Select
                value={config.storeType}
                onValueChange={(v) => update({ storeType: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lancedb">LanceDB</SelectItem>
                  <SelectItem value="chroma">ChromaDB</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Dimensions</Label>
              <Input
                type="number"
                value={config.newCollectionDimensions}
                onChange={(e) =>
                  update({ newCollectionDimensions: parseInt(e.target.value) || 384 })
                }
                min={1}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ======== Step 5 — Review & Run ========

function Step5Review({
  config,
  update,
  onError,
  onSuccess,
}: {
  config: PipelineConfig
  update: (p: Partial<PipelineConfig>) => void
  onError: (msg: string) => void
  onSuccess: (wfId: string) => void
}) {
  const [saveAsTemplate, setSaveAsTemplate] = useState(false)
  const [templateName, setTemplateName] = useState(config.pipelineName)
  const [templates, setTemplates] = useState(loadTemplates)
  const [loadingText, setLoadingText] = useState("")

  const estChunks =
    config.sourceType === "text"
      ? previewChunks(config.rawText, config.chunkSize, config.chunkOverlap).length
      : config.files.reduce(
          (acc, f) =>
            acc + Math.ceil(f.size / Math.max(config.chunkSize - config.chunkOverlap, 1)),
          0,
        )

  const runMutation = useMutation({
    mutationFn: async () => {
      onError("")
      setLoadingText("Reading source content…")

      // Build text from source
      let fullText = ""
      let sourceName = "pipeline"
      if (config.sourceType === "file") {
        const texts = await Promise.all(config.files.map(readFileAsText))
        fullText = texts.join("\n\n---\n\n")
        sourceName = config.files.map((f) => f.name).join(", ")
      } else {
        fullText = config.rawText
        sourceName = "text-input"
      }

      setLoadingText("Chunking content…")

      // If creating new collection, create it first
      if (config.collectionMode === "new" && config.collection) {
        setLoadingText("Creating collection…")
        await collectionApi.create({
          name: config.collection,
          store_type: config.storeType,
          store_name: config.collection,
          dimensions: config.newCollectionDimensions,
        })
      }

      setLoadingText("Building records…")
      const records = buildRecords(fullText, config.chunkSize, config.chunkOverlap, sourceName)

      setLoadingText(`Triggering ingest (${records.length} records)…`)
      const resp = await ingestApi.ingest(config.collection, {
        records,
        store_type: config.storeType,
      })

      // Save template if requested
      if (saveAsTemplate && templateName.trim()) {
        const tpl: PipelineTemplate = {
          id: `tpl-${Date.now()}`,
          name: templateName.trim(),
          config: {
            sourceType: config.sourceType,
            embeddingModel: config.embeddingModel,
            chunkStrategy: config.chunkStrategy,
            chunkSize: config.chunkSize,
            chunkOverlap: config.chunkOverlap,
            collectionMode: config.collectionMode,
            collection: config.collection,
            storeType: config.storeType,
            newCollectionDimensions: config.newCollectionDimensions,
            pipelineName: templateName.trim(),
          },
          createdAt: Date.now(),
        }
        saveTemplate(tpl)
      }

      return resp.workflow_id
    },
    onSuccess,
    onError: (err: Error) => {
      setLoadingText("")
      onError(err.message)
    },
  })

  function applyTemplate(tpl: PipelineTemplate) {
    update({
      embeddingModel: tpl.config.embeddingModel,
      chunkStrategy: tpl.config.chunkStrategy,
      chunkSize: tpl.config.chunkSize,
      chunkOverlap: tpl.config.chunkOverlap,
      collectionMode: tpl.config.collectionMode,
      collection: tpl.config.collection,
      storeType: tpl.config.storeType,
      newCollectionDimensions: tpl.config.newCollectionDimensions,
    })
  }

  function handleDeleteTemplate(id: string) {
    deleteTemplate(id)
    setTemplates(loadTemplates())
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Review & Run</CardTitle>
          <CardDescription>Confirm your pipeline configuration</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Pipeline Name</Label>
              <Input
                value={config.pipelineName}
                onChange={(e) => update({ pipelineName: e.target.value })}
              />
            </div>

            <Separator />

            <div className="grid gap-3 sm:grid-cols-2 text-sm">
              <SummaryRow
                label="Data Source"
                value={
                  config.sourceType === "file"
                    ? `${config.files.length} file(s)`
                    : `Raw text (${config.rawText.length.toLocaleString()} chars)`
                }
              />
              <SummaryRow
                label="Embedding Model"
                value={
                  config.embeddingModel === "active"
                    ? "Active model"
                    : config.embeddingModel.split("/").pop() ?? config.embeddingModel
                }
              />
              <SummaryRow
                label="Chunking"
                value={`${config.chunkStrategy} · ${config.chunkSize}ch / ${config.chunkOverlap}ch overlap`}
              />
              <SummaryRow
                label="Est. Chunks"
                value={`~${estChunks.toLocaleString()} records`}
              />
              <SummaryRow
                label="Target Collection"
                value={config.collection || "—"}
              />
              <SummaryRow label="Store Type" value={config.storeType} />
            </div>

            <Separator />

            <Button
              className="w-full"
              size="lg"
              onClick={() => runMutation.mutate()}
              disabled={!config.collection || runMutation.isPending}
            >
              {runMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  {loadingText || "Running…"}
                </>
              ) : (
                <>
                  <Play className="mr-2 h-5 w-5" />
                  Run Pipeline
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Templates */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <BookTemplate className="h-4 w-4" />
            Pipeline Templates
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Save as template */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="cursor-pointer" htmlFor="save-template">
                Save this configuration as a template
              </Label>
              <Switch
                id="save-template"
                checked={saveAsTemplate}
                onCheckedChange={setSaveAsTemplate}
              />
            </div>
            {saveAsTemplate && (
              <Input
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="Template name…"
              />
            )}
          </div>

          {/* Existing templates */}
          {templates.length > 0 && (
            <div>
              <p className="mb-2 text-xs text-muted-foreground">
                Saved templates — click to load
              </p>
              <div className="space-y-1.5">
                {templates.map((tpl) => (
                  <div
                    key={tpl.id}
                    className="flex items-center justify-between rounded-md border border-border px-3 py-2 hover:bg-muted/50 transition-colors"
                  >
                    <button
                      className="flex-1 text-left text-sm"
                      onClick={() => applyTemplate(tpl)}
                    >
                      <span className="font-medium">{tpl.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {new Date(tpl.createdAt).toLocaleDateString()}
                      </span>
                    </button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-red-400"
                      onClick={() => handleDeleteTemplate(tpl.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium truncate">{value}</p>
    </div>
  )
}

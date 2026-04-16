import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import {
  Loader2,
  Plus,
  Trash2,
  Database,
  Hash,
  Calendar,
  Search,
  Layers,
} from "lucide-react"
import type { CollectionListResponse, CollectionInfo } from "@/lib/api-client"
import { collectionApi } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Progress } from "@/components/ui/progress"

// Nominal max for the vector count progress bar (visual only)
const VECTOR_BAR_MAX = 10_000

export default function CollectionsPage() {
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)

  const { data, isLoading } = useQuery<CollectionListResponse>({
    queryKey: ["collections"],
    queryFn: collectionApi.list,
  })

  const deleteMutation = useMutation({
    mutationFn: (name: string) => collectionApi.delete(name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["collections"] }),
  })

  const collections = data?.collections ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Collections</h1>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-1 h-3.5 w-3.5" />
              Create Collection
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Collection</DialogTitle>
            </DialogHeader>
            <CreateCollectionForm
              onSuccess={() => {
                setCreateOpen(false)
                queryClient.invalidateQueries({ queryKey: ["collections"] })
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : collections.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <Database className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium">No collections yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Create a collection to start ingesting vector data
          </p>
          <Button
            size="sm"
            className="mt-4"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Create Collection
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {collections.map((coll) => (
            <CollectionCard
              key={coll.id}
              collection={coll}
              onDelete={() => deleteMutation.mutate(coll.name)}
              isDeleting={
                deleteMutation.isPending &&
                deleteMutation.variables === coll.name
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ---- Collection Card ----

function CollectionCard({
  collection,
  onDelete,
  isDeleting,
}: {
  collection: CollectionInfo
  onDelete: () => void
  isDeleting: boolean
}) {
  const navigate = useNavigate()
  const vectorPct = Math.min((collection.vector_count / VECTOR_BAR_MAX) * 100, 100)

  const storeColor =
    collection.store_type === "lancedb"
      ? "border-violet-800 bg-violet-500/10 text-violet-400"
      : "border-blue-800 bg-blue-500/10 text-blue-400"

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-base truncate">{collection.name}</CardTitle>
            <div className="mt-1 flex items-center gap-1.5 flex-wrap">
              <Badge variant="outline" className={`text-xs ${storeColor}`}>
                {collection.store_type}
              </Badge>
              <Badge variant="outline" className="text-xs tabular-nums">
                <Hash className="mr-0.5 h-2.5 w-2.5" />
                {collection.dimensions}d
              </Badge>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400 shrink-0"
            onClick={onDelete}
            disabled={isDeleting}
            title="Delete collection"
          >
            {isDeleting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-between gap-3">
        {/* Vector count */}
        <div>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="flex items-center gap-1 text-muted-foreground">
              <Layers className="h-3 w-3" />
              {collection.vector_count.toLocaleString()} vectors
            </span>
            {collection.created_at && (
              <span className="flex items-center gap-1 text-muted-foreground">
                <Calendar className="h-3 w-3" />
                {new Date(collection.created_at).toLocaleDateString()}
              </span>
            )}
          </div>
          <Progress value={vectorPct} className="h-1" />
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 text-xs"
            onClick={() => navigate(`/query?collection=${collection.name}`)}
          >
            <Search className="mr-1 h-3 w-3" />
            Query
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ---- Create Collection Form ----

function CreateCollectionForm({ onSuccess }: { onSuccess: () => void }) {
  const [name, setName] = useState("")
  const [storeType, setStoreType] = useState("lancedb")
  const [storeName, setStoreName] = useState("")
  const [dimensions, setDimensions] = useState("384")
  const [error, setError] = useState<string | null>(null)

  const createMutation = useMutation({
    mutationFn: () =>
      collectionApi.create({
        name,
        store_type: storeType,
        store_name: storeName || name,
        dimensions: parseInt(dimensions) || 384,
      }),
    onSuccess,
    onError: (err: Error) => setError(err.message),
  })

  return (
    <div className="space-y-4 pt-2">
      {error && (
        <div className="rounded-md bg-red-500/10 border border-red-800 p-3 text-sm text-red-400">
          {error}
        </div>
      )}
      <div className="space-y-1.5">
        <Label>Collection Name</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="my-collection"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
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
        <div className="space-y-1.5">
          <Label>Dimensions</Label>
          <Input
            type="number"
            value={dimensions}
            onChange={(e) => setDimensions(e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>
          Physical Store Name{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Input
          value={storeName}
          onChange={(e) => setStoreName(e.target.value)}
          placeholder={name || "defaults to collection name"}
        />
      </div>
      <Button
        className="w-full"
        onClick={() => createMutation.mutate()}
        disabled={!name || createMutation.isPending}
      >
        {createMutation.isPending && (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        )}
        Create Collection
      </Button>
    </div>
  )
}

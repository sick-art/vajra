import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import {
  Loader2,
  Plus,
  Trash2,
  Upload,
  Play,
} from "lucide-react"
import type { EvalDataset, EvalRun, CollectionListResponse } from "@/lib/api-client"
import { evalApi, collectionApi } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export default function EvalDatasetsPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [createOpen, setCreateOpen] = useState(false)

  const { data: datasets, isLoading } = useQuery<EvalDataset[]>({
    queryKey: ["eval-datasets"],
    queryFn: evalApi.listDatasets,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => evalApi.deleteDataset(id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["eval-datasets"] }),
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">
          Evaluation Datasets
        </h1>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-1 h-3 w-3" />
              Create Dataset
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create Evaluation Dataset</DialogTitle>
            </DialogHeader>
            <CreateDatasetForm
              onSuccess={() => {
                setCreateOpen(false)
                queryClient.invalidateQueries({ queryKey: ["eval-datasets"] })
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Loading...
            </div>
          ) : !datasets?.length ? (
            <div className="flex flex-col items-center py-12 text-muted-foreground">
              <Upload className="mb-2 h-8 w-8" />
              <p>No datasets yet</p>
              <p className="text-sm">Create a dataset with query-relevance pairs</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Collection</TableHead>
                  <TableHead>Queries</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {datasets.map((ds) => (
                  <TableRow key={ds.id}>
                    <TableCell className="font-medium">{ds.name}</TableCell>
                    <TableCell>{ds.collection}</TableCell>
                    <TableCell>{ds.query_count}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {ds.created_at
                        ? new Date(ds.created_at).toLocaleDateString()
                        : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <RunEvalButton datasetId={ds.id} datasetName={ds.name} />
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-400 hover:text-red-300"
                          onClick={() => deleteMutation.mutate(ds.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
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

function RunEvalButton({
  datasetId,
  datasetName,
}: {
  datasetId: string
  datasetName: string
}) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [topK, setTopK] = useState("10")
  const [searchType, setSearchType] = useState("dense")

  const runMutation = useMutation({
    mutationFn: async () => {
      const run = await evalApi.createRun({
        dataset_id: datasetId,
        name: name || `Run - ${datasetName}`,
        top_k: parseInt(topK) || 10,
        search_type: searchType,
      })
      const executed = await evalApi.executeRun(run.id)
      return executed
    },
    onSuccess: (run: EvalRun) => {
      setOpen(false)
      navigate(`/eval/runs/${run.id}`)
    },
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Play className="h-3 w-3" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Run Evaluation</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Run Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`Run - ${datasetName}`}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Top K</Label>
              <Input
                type="number"
                value={topK}
                onChange={(e) => setTopK(e.target.value)}
              />
            </div>
            <div className="space-y-2">
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
            onClick={() => runMutation.mutate()}
            disabled={runMutation.isPending}
          >
            {runMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Run Evaluation
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function CreateDatasetForm({ onSuccess }: { onSuccess: () => void }) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [collection, setCollection] = useState("")
  const [queriesJson, setQueriesJson] = useState(
    JSON.stringify(
      [
        {
          query_text: "example search query",
          relevant_ids: ["doc-1", "doc-2"],
          relevance_scores: [1.0, 0.8],
        },
      ],
      null,
      2,
    ),
  )
  const [error, setError] = useState<string | null>(null)

  const { data: collData } = useQuery<CollectionListResponse>({
    queryKey: ["collections"],
    queryFn: collectionApi.list,
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      const queries = JSON.parse(queriesJson)
      return evalApi.createDataset({
        name,
        description: description || undefined,
        collection,
        queries,
      })
    },
    onSuccess,
    onError: (err: Error) => setError(err.message),
  })

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md bg-red-500/10 border border-red-800 p-3 text-sm text-red-400">
          {error}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Dataset Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="my-eval-dataset" />
        </div>
        <div className="space-y-2">
          <Label>Collection</Label>
          <Select value={collection} onValueChange={setCollection}>
            <SelectTrigger>
              <SelectValue placeholder="Select collection" />
            </SelectTrigger>
            <SelectContent>
              {(collData?.collections ?? []).map((c) => (
                <SelectItem key={c.name} value={c.name}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label>Description</Label>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" />
      </div>
      <div className="space-y-2">
        <Label>Queries (JSON)</Label>
        <Textarea
          value={queriesJson}
          onChange={(e) => setQueriesJson(e.target.value)}
          rows={10}
          className="font-mono text-xs"
        />
        <p className="text-xs text-muted-foreground">
          Array of objects with: query_text, relevant_ids, relevance_scores (optional)
        </p>
      </div>
      <Button
        className="w-full"
        onClick={() => createMutation.mutate()}
        disabled={!name || !collection || createMutation.isPending}
      >
        {createMutation.isPending && (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        )}
        Create Dataset
      </Button>
    </div>
  )
}

const BASE_URL = ""

async function apiRequest<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText)
    throw new Error(`${res.status}: ${detail}`)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

function apiGet<T>(path: string) {
  return apiRequest<T>("GET", path)
}

function apiPost<T>(path: string, body?: unknown) {
  return apiRequest<T>("POST", path, body)
}

function apiDelete(path: string) {
  return apiRequest<void>("DELETE", path)
}

// --- Types ---

export interface WorkflowSummary {
  workflow_id: string
  workflow_type: string
  status: string
  start_time: string | null
  close_time: string | null
  task_queue: string
}

export interface WorkflowListResponse {
  workflows: WorkflowSummary[]
  next_page_token: string | null
}

export interface WorkflowDetail {
  workflow_id: string
  run_id: string | null
  workflow_type: string
  status: string
  start_time: string | null
  close_time: string | null
  input: Record<string, unknown> | null
  result: unknown
}

export interface ActivityEvent {
  activity_type: string
  event_type: string
  timestamp: string | null
  input_: unknown
  result: unknown
  error: string | null
}

export interface WorkflowHistory {
  workflow_id: string
  events: ActivityEvent[]
}

export interface CollectionInfo {
  id: string
  name: string
  store_type: string
  store_name: string
  dimensions: number
  metadata_schema: Record<string, unknown>
  created_at: string | null
  updated_at: string | null
  vector_count: number
}

export interface CollectionListResponse {
  collections: CollectionInfo[]
  total: number
}

export interface CollectionCreateRequest {
  name: string
  store_type: string
  store_name: string
  dimensions?: number
  metadata_schema?: Record<string, unknown>
  required_metadata?: string[]
  optional_metadata?: string[]
  forbidden_metadata?: string[]
  embedding_model?: string | null
}

export interface IngestRecord {
  id: string
  text?: string | null
  vector?: number[] | null
  metadata?: Record<string, unknown>
}

export interface IngestRequest {
  records: IngestRecord[]
  store_type: string
  idempotency_key?: string | null
}

export interface IngestResponse {
  workflow_id: string
  accepted: number
  status: string
}

export interface ScoredResult {
  id: string
  score: number
  metadata: Record<string, unknown>
  text: string | null
  store_type: string
}

export interface QueryRequest {
  query_text?: string | null
  vector?: number[] | null
  top_k?: number
  filter?: Record<string, unknown> | null
  store_types?: string[] | null
  search_type?: string
}

export interface QueryResponse {
  results: ScoredResult[]
  total: number
  stores_queried: string[]
  latency_ms: number
}

export interface HealthResponse {
  status: string
  components: Record<string, { status: string; [k: string]: unknown }>
}

export interface EvalDataset {
  id: string
  name: string
  description: string | null
  collection: string
  query_count: number
  created_at: string | null
}

export interface EvalQuery {
  id: string
  dataset_id: string
  query_text: string
  relevant_ids: string[]
  relevance_scores: number[]
  metadata: Record<string, unknown>
}

export interface EvalDatasetDetail extends EvalDataset {
  queries: EvalQuery[]
}

export interface EvalRun {
  id: string
  dataset_id: string
  name: string
  store_type: string | null
  embedding_model: string | null
  top_k: number
  search_type: string
  status: string
  workflow_id: string | null
  created_at: string | null
  completed_at: string | null
}

export interface EvalRunMetrics {
  avg_ndcg: number
  avg_recall_at_k: number
  avg_precision_at_k: number
  median_ndcg: number | null
  median_recall_at_k: number | null
  median_precision_at_k: number | null
  p95_latency_ms: number | null
  total_queries: number
}

export interface EvalRunDetail extends EvalRun {
  metrics: EvalRunMetrics | null
}

export interface EvalResult {
  id: string
  run_id: string
  query_id: string
  query_text: string
  returned_ids: string[]
  returned_scores: number[]
  ndcg: number | null
  recall_at_k: number | null
  precision_at_k: number | null
  latency_ms: number | null
  metadata: Record<string, unknown>
}

export interface ModelInfo {
  name: string
  dimensions: number
  is_loaded: boolean
}

export interface ModelListResponse {
  models: ModelInfo[]
  active_model: string
}

export interface ChunkStrategy {
  id: string
  name: string
  description: string
}

export interface ChunkPreviewResponse {
  chunks: string[]
  chunk_count: number
  total_chars: number
}

// --- API Namespaces ---

export const workflowApi = {
  list: (params?: { page_size?: number; status?: string; query?: string }) => {
    const sp = new URLSearchParams()
    if (params?.page_size) sp.set("page_size", String(params.page_size))
    if (params?.status) sp.set("status", params.status)
    if (params?.query) sp.set("query", params.query)
    const qs = sp.toString()
    return apiGet<WorkflowListResponse>(`/v1/workflows${qs ? `?${qs}` : ""}`)
  },
  get: (id: string) => apiGet<WorkflowDetail>(`/v1/workflows/${id}`),
  history: (id: string) => apiGet<WorkflowHistory>(`/v1/workflows/${id}/history`),
  cancel: (id: string) => apiPost<{ status: string }>(`/v1/workflows/${id}/cancel`),
  terminate: (id: string, reason?: string) =>
    apiPost<{ status: string }>(`/v1/workflows/${id}/terminate`, { reason }),
}

export const collectionApi = {
  list: () => apiGet<CollectionListResponse>("/v1/collections"),
  get: (name: string) => apiGet<CollectionInfo>(`/v1/collections/${name}`),
  create: (data: CollectionCreateRequest) =>
    apiRequest<CollectionInfo>("POST", "/v1/collections", data),
  delete: (name: string) => apiDelete(`/v1/collections/${name}`),
}

export const ingestApi = {
  ingest: (collection: string, data: IngestRequest) =>
    apiPost<IngestResponse>(`/v1/ingest/${collection}`, data),
}

export const queryApi = {
  queryCollection: (collection: string, data: QueryRequest) =>
    apiPost<QueryResponse>(`/v1/query/${collection}`, data),
  queryFederated: (data: QueryRequest) =>
    apiPost<QueryResponse>("/v1/query", data),
}

export const healthApi = {
  check: () => apiGet<HealthResponse>("/v1/health"),
}

export const evalApi = {
  createDataset: (data: {
    name: string
    description?: string
    collection: string
    queries: Array<{
      query_text: string
      relevant_ids: string[]
      relevance_scores?: number[]
    }>
  }) => apiPost<EvalDatasetDetail>("/v1/eval/datasets", data),

  listDatasets: () => apiGet<EvalDataset[]>("/v1/eval/datasets"),

  getDataset: (id: string) =>
    apiGet<EvalDatasetDetail>(`/v1/eval/datasets/${id}`),

  deleteDataset: (id: string) => apiDelete(`/v1/eval/datasets/${id}`),

  createRun: (data: {
    dataset_id: string
    name: string
    store_type?: string | null
    embedding_model?: string | null
    top_k?: number
    search_type?: string
  }) => apiPost<EvalRun>("/v1/eval/runs", data),

  executeRun: (id: string) =>
    apiPost<EvalRunDetail>(`/v1/eval/runs/${id}/execute`),

  listRuns: (datasetId?: string) => {
    const qs = datasetId ? `?dataset_id=${datasetId}` : ""
    return apiGet<EvalRun[]>(`/v1/eval/runs${qs}`)
  },

  getRun: (id: string) => apiGet<EvalRunDetail>(`/v1/eval/runs/${id}`),

  getRunResults: (id: string) =>
    apiGet<EvalResult[]>(`/v1/eval/runs/${id}/results`),
}

export const settingsApi = {
  listModels: () => apiGet<ModelListResponse>("/v1/settings/models"),
  switchModel: (name: string) =>
    apiPost<ModelInfo>("/v1/settings/models/switch", { model_name: name }),
  listChunkingStrategies: () =>
    apiGet<ChunkStrategy[]>("/v1/settings/chunking/strategies"),
  previewChunking: (text: string, config: Record<string, unknown>) =>
    apiPost<ChunkPreviewResponse>("/v1/settings/chunking/preview", {
      text,
      config,
    }),
}

// Shared API response types (per ARCHITECTURE.md §4.2). The wire format is
// camelCase; all rates/ratios are DECIMAL FRACTIONS (0.0482 == 4.82%).

export type RunStatus = "success" | "partial" | "failed"

export interface RunSummary {
  id: string
  createdAt: string // ISO timestamp
  filename: string | null
  rowCount: number
  validRowCount: number
  status: RunStatus
}

export interface ValidationErrorDTO {
  rowNumber: number
  assetId: string | null
  field: string
  errorType: string // 'missing' | 'invalid_type' | 'constraint_violation' | 'duplicate'
  message: string
}

export interface BreakdownDTO {
  count: number
  volume: number // EUR
  pct: number // decimal fraction
}

export interface EsmaFlagDTO {
  code: string
  severity: "error" | "warning" | "info"
  message: string
  affectedRows: number
}

export interface RiskSignalDTO {
  type: string
  severity: "high" | "medium" | "low"
  description: string
  recommendation: string
}

// One deterministic compliance check outcome (computed in code, never by the
// LLM). observed/threshold are decimal fractions where applicable.
export interface RuleResultDTO {
  ruleCode: string
  severity: "error" | "warning" | "info"
  passed: boolean
  observedValue: number | null
  thresholdValue: number | null
  message: string
}

export interface AnalysisDTO {
  // which LLM produced the qualitative layer (null on legacy rows)
  provider: string | null
  model: string | null
  totalPoolVolume: number
  weightedAvgRate: number
  weightedAvgLtv: number | null
  avgRemainingTenor: number
  delinquencyRate: number
  concentrationTop5: number
  // single-obligor concentration; null when the pool has no borrower_id data
  obligorTop1: number | null
  obligorTop5: number | null
  assetTypeBreakdown: Record<string, BreakdownDTO>
  countryBreakdown: Record<string, BreakdownDTO>
  esmaFlags: EsmaFlagDTO[]
  riskSignals: RiskSignalDTO[]
  executiveSummary: string
}

// Response shape for POST /api/analyze and GET /api/history/:id.
// `analysis` is null for failed runs (status === "failed").
// `ruleResults` is empty for failed runs (no metrics → no checks) and for
// runs that predate the rules engine.
export interface AnalyzeResponse {
  run: RunSummary
  validationErrors: ValidationErrorDTO[]
  ruleResults: RuleResultDTO[]
  analysis: AnalysisDTO | null
}

// One row in the GET /api/history list: run summary + joined summary fields
// from analysis_results (null when the run has no result, e.g. failed runs).
export interface HistoryItem extends RunSummary {
  totalPoolVolume: number | null
  esmaFlagCount: number | null
  riskSignalCount: number | null
  model: string | null // which LLM produced the run's analysis
}

export interface HistoryResponse {
  runs: HistoryItem[]
  total: number
  page: number
  limit: number
}

// ── Chat (Phase 2, §S.5/§S.6) ───────────────────────────────────────────────

export interface ChatConversationDTO {
  id: string
  title: string
  attachedRunId: string | null
  createdAt: string
  updatedAt: string
}

export interface ChatMessageDTO {
  id: string
  role: "user" | "assistant"
  content: string
  // set on messages that attached/switched the conversation's run context
  attachedRunId: string | null
  createdAt: string
}

export interface ChatDetailResponse {
  conversation: ChatConversationDTO
  messages: ChatMessageDTO[]
}

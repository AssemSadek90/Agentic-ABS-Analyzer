// API response types — mirror the backend §4.2 wire format. All rates/ratios are
// DECIMAL FRACTIONS (0.0482 == 4.82%); multiply by 100 for display.

export type RunStatus = "success" | "partial" | "failed"

export interface AuthUser {
  id: string
  email: string
  displayName: string
}

// ── Model selection & BYOK keys (Phase 2, §S.4/§S.6) ────────────────────────

export interface ModelSelection {
  provider: string
  model: string
}

export interface ModelEntry {
  id: string
  label: string
  tier: "high" | "medium" | "low" // relative token cost / capability
  releasedAt?: string | null // YYYY-MM-DD from the dynamic catalog
}

export interface ProviderModels {
  id: string
  models: ModelEntry[]
  hasKey: boolean
}

export interface ModelsResponse {
  providers: ProviderModels[]
  serverDefault: ModelSelection
  refreshedAt?: string // when the backend last rebuilt the model catalog
}

export interface ProviderKeyInfo {
  provider: string
  last4: string
  createdAt: string
}

// ── Chat (Phase 2, §S.5/§S.6) ───────────────────────────────────────────────

export interface ChatConversation {
  id: string
  title: string
  attachedRunId: string | null
  createdAt: string
  updatedAt: string
}

export interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  attachedRunId: string | null
  createdAt: string
}

export interface ChatDetail {
  conversation: ChatConversation
  messages: ChatMessage[]
}

export interface ChatUsage {
  inputTokens: number
  outputTokens: number
}

export interface RunSummary {
  id: string
  createdAt: string
  filename: string | null
  rowCount: number
  validRowCount: number
  status: RunStatus
}

export interface ValidationErrorDTO {
  rowNumber: number
  assetId: string | null
  field: string
  errorType: string
  message: string
}

export interface BreakdownDTO {
  count: number
  volume: number
  pct: number
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
// LLM). observed/threshold are decimal fractions — multiply by 100 for display.
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
  // (optional so results cached before this feature still parse)
  obligorTop1?: number | null
  obligorTop5?: number | null
  assetTypeBreakdown: Record<string, BreakdownDTO>
  countryBreakdown: Record<string, BreakdownDTO>
  esmaFlags: EsmaFlagDTO[]
  riskSignals: RiskSignalDTO[]
  executiveSummary: string
}

export interface AnalyzeResponse {
  run: RunSummary
  validationErrors: ValidationErrorDTO[]
  // optional so results cached before the rules engine still parse
  ruleResults?: RuleResultDTO[]
  analysis: AnalysisDTO | null
}

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

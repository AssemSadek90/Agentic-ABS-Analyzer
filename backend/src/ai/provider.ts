import type { PoolMetrics } from "../metrics/compute"
import type { ValidatedAssetRow } from "../pipeline/schema"
import type { RuleResultDTO } from "../types"

export type ProviderId = "anthropic" | "openai" | "gemini"

// The qualitative half of the analysis — the only part an LLM produces. Moved
// here from the retired ai/analyze.ts so every provider fulfils one contract.
export interface QualitativeAnalysis {
  esma_flags: Array<{
    code: string
    severity: "error" | "warning" | "info"
    message: string
    affected_rows: number
  }>
  risk_signals: Array<{
    type: string
    severity: "high" | "medium" | "low"
    description: string
    recommendation: string
  }>
  executive_summary: string
}

export interface QualitativeRequest {
  metrics: PoolMetrics
  validRows: ValidatedAssetRow[]
  validationSummary: string
  // deterministic compliance check outcomes, passed to the prompt as ground truth
  ruleResults: RuleResultDTO[]
  model: string
  apiKey: string // decrypted user key OR the server demo key; never logged
}

export interface QualitativeResult {
  analysis: QualitativeAnalysis
  raw: unknown
  usage: { inputTokens: number; outputTokens: number }
}

export interface QualitativeProvider {
  id: ProviderId
  runQualitativeAnalysis(req: QualitativeRequest): Promise<QualitativeResult>
}

// The provider rejected the API key (401/403). Routes map this to a 502 with a
// "check your API key" message and never retry it.
export class ProviderAuthError extends Error {
  provider: ProviderId
  constructor(provider: ProviderId) {
    super(`${provider} rejected the API key`)
    this.name = "ProviderAuthError"
    this.provider = provider
  }
}

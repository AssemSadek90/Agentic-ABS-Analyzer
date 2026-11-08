import type { ProviderId } from "../provider"

// One entry in the model picker. Shape kept compatible with the old static
// registry (id/label/tier) so the frontend contract only gains fields.
export interface ModelEntry {
  id: string
  label: string
  // relative token cost, computed from list prices across the whole catalog
  tier: "high" | "medium" | "low"
  // provider release date (YYYY-MM-DD) when known; drives ordering + "New" tag
  releasedAt: string | null
}

export interface ModelCatalog {
  providers: Record<ProviderId, ModelEntry[]>
  // What runs when a request names no model: an Anthropic model on the
  // platform demo key (the only provider the server holds a key for).
  serverDefault: { provider: ProviderId; model: string }
  refreshedAt: string // ISO timestamp of the build
  // Per-source outcome of the build, e.g. { "models.dev": "ok", anthropic: "ok" }
  sources: Record<string, string>
}

// A model as reported by one source, before curation. Fields a source does
// not know stay null ("unknown" is never treated as "unsupported").
export interface CandidateModel {
  provider: ProviderId
  id: string
  label: string | null
  releasedAt: string | null
  inputCost: number | null // USD per 1M tokens
  outputCost: number | null
  toolCall: boolean | null
  structuredOutput: boolean | null
  textOnlyOutput: boolean | null
  deprecated: boolean
  experimental: boolean // e.g. models.dev status "alpha"
  line: string | null // Anthropic model line (opus/sonnet/haiku/...), when reported
}

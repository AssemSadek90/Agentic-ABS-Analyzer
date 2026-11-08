import Anthropic from "@anthropic-ai/sdk"
import OpenAI from "openai"
import { GoogleGenAI } from "@google/genai"
import type { ProviderId } from "../provider"
import type { CandidateModel } from "./types"

// Each fetcher returns raw candidates from ONE source. Curation (filtering,
// de-duplication, tiers) happens in ./build.ts, which merges the sources.

const TIMEOUT_MS = 20_000

const blank = (provider: ProviderId, id: string): CandidateModel => ({
  provider,
  id,
  label: null,
  releasedAt: null,
  inputCost: null,
  outputCost: null,
  toolCall: null,
  structuredOutput: null,
  textOnlyOutput: null,
  deprecated: false,
  experimental: false,
  line: null
})

// ── models.dev ─────────────────────────────────────────────────────────────
// Open-source model metadata catalog (github.com/sst/models.dev, used by
// opencode). Supplies what provider APIs do not: list prices (→ tiers),
// tool-calling / structured-output support, output modalities, release dates.
// It covers every provider, so it is also the availability source for
// providers the server holds no key for (OpenAI, Gemini are BYOK-only here).

const MODELS_DEV_URL = process.env.MODELS_DEV_URL ?? "https://models.dev/api.json"
const MODELS_DEV_PROVIDER: Record<ProviderId, string> = {
  anthropic: "anthropic",
  openai: "openai",
  gemini: "google"
}

interface ModelsDevModel {
  id?: string
  name?: string
  release_date?: string
  tool_call?: boolean
  structured_output?: boolean
  status?: string
  modalities?: { input?: string[]; output?: string[] }
  cost?: { input?: number; output?: number }
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null)
const bool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null)
const date = (v: unknown): string | null =>
  typeof v === "string" && /^\d{4}-\d{2}(-\d{2})?$/.test(v) ? v : null

export const fetchModelsDev = async (): Promise<Record<ProviderId, CandidateModel[]>> => {
  const res = await fetch(MODELS_DEV_URL, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) throw new Error(`models.dev responded ${res.status}`)
  const body = (await res.json()) as Record<string, { models?: Record<string, ModelsDevModel> }>

  const out = { anthropic: [], openai: [], gemini: [] } as Record<ProviderId, CandidateModel[]>
  for (const provider of Object.keys(MODELS_DEV_PROVIDER) as ProviderId[]) {
    const models = body[MODELS_DEV_PROVIDER[provider]]?.models ?? {}
    for (const [key, m] of Object.entries(models)) {
      const output = m.modalities?.output
      out[provider].push({
        ...blank(provider, m.id ?? key),
        label: m.name ?? null,
        releasedAt: date(m.release_date),
        inputCost: num(m.cost?.input),
        outputCost: num(m.cost?.output),
        toolCall: bool(m.tool_call),
        structuredOutput: bool(m.structured_output),
        textOnlyOutput: Array.isArray(output) ? output.length === 1 && output[0] === "text" : null,
        deprecated: m.status === "deprecated",
        experimental: m.status === "alpha"
      })
    }
  }
  return out
}

// ── Anthropic Models API ───────────────────────────────────────────────────
// GET /v1/models lists what the key can call, newest first, with lifecycle
// (active / deprecated / retired), the model line and capability flags. The
// installed SDK predates those fields, so they are read as optional extras.

type AnthropicModelInfo = Anthropic.ModelInfo & {
  lifecycle?: "active" | "deprecated" | "retired"
  line?: string | null
  capabilities?: { structured_outputs?: { supported?: boolean } } | null
}

export const fetchAnthropicModels = async (apiKey: string): Promise<CandidateModel[]> => {
  const client = new Anthropic({ apiKey, timeout: TIMEOUT_MS, maxRetries: 1 })
  const out: CandidateModel[] = []
  // The SDK page auto-paginates under for-await.
  for await (const raw of client.models.list({ limit: 1000 })) {
    const m = raw as AnthropicModelInfo
    out.push({
      ...blank("anthropic", m.id),
      label: m.display_name ?? null,
      releasedAt: date(typeof m.created_at === "string" ? m.created_at.slice(0, 10) : null),
      // Every Claude model on the Messages API supports tool use.
      toolCall: true,
      structuredOutput: bool(m.capabilities?.structured_outputs?.supported),
      textOnlyOutput: true,
      deprecated: m.lifecycle !== undefined && m.lifecycle !== "active",
      line: m.line ?? null
    })
  }
  return out
}

// ── OpenAI / Gemini list APIs (optional) ───────────────────────────────────
// Only used when the server is given OPENAI_API_KEY / GEMINI_API_KEY. They
// narrow the catalog to models those keys can actually call. Without them the
// catalog relies on models.dev for these providers, and a user's own key is
// checked when the request runs.

export const fetchOpenAIModelIds = async (apiKey: string): Promise<CandidateModel[]> => {
  const client = new OpenAI({ apiKey, timeout: TIMEOUT_MS, maxRetries: 1 })
  const out: CandidateModel[] = []
  for await (const m of client.models.list()) out.push(blank("openai", m.id))
  return out
}

export const fetchGeminiModels = async (apiKey: string): Promise<CandidateModel[]> => {
  const ai = new GoogleGenAI({ apiKey })
  const out: CandidateModel[] = []
  const pager = await ai.models.list({ config: { pageSize: 1000 } })
  for await (const m of pager) {
    if (!m.name) continue
    const actions = (m as { supportedActions?: string[] }).supportedActions
    if (Array.isArray(actions) && !actions.includes("generateContent")) continue
    out.push({ ...blank("gemini", m.name.replace(/^models\//, "")), label: m.displayName ?? null })
  }
  return out
}

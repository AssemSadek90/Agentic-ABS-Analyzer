import type { ProviderId } from "../provider"
import { SEED_CATALOG } from "./seed"
import type { CandidateModel, ModelCatalog, ModelEntry } from "./types"

// Pure curation: raw candidates from the sources in, the picker catalog out.
// No I/O here so the rules are easy to read and test.

const PROVIDERS: readonly ProviderId[] = ["anthropic", "openai", "gemini"]

const maxPerProvider = (): number => {
  const n = Number(process.env.MODEL_CATALOG_MAX_PER_PROVIDER)
  return Number.isInteger(n) && n > 0 ? n : 6
}

// Models this app cannot drive: the analysis needs structured JSON output and
// the chat needs tool calls over the text APIs the adapters use (Anthropic
// Messages, OpenAI Chat Completions, Gemini generateContent). Capability flags
// catch most of these; the id patterns catch families the metadata misses.
const EXCLUDED_ID = /(realtime|audio|tts|transcribe|whisper|embed|image|moderation|search|computer-use|codex|deep-research|live|omni|translate|instruct|customtools|^chatgpt|-latest$)/i
const EXCLUDED_ID_BY_PROVIDER: Partial<Record<ProviderId, RegExp>> = {
  // OpenAI "-pro" models are served on the Responses API only, not Chat
  // Completions; gpt-oss is open-weight (self-hosted, not the OpenAI API).
  openai: /(-pro($|-)|^gpt-oss)/i,
  // Gemma models are open-weight; the analysis targets Gemini models.
  gemini: /^gemma/i
}

const isUsable = (c: CandidateModel): boolean =>
  !c.deprecated &&
  !c.experimental &&
  c.toolCall !== false &&
  c.structuredOutput !== false &&
  c.textOnlyOutput !== false &&
  !EXCLUDED_ID.test(c.id) &&
  !(EXCLUDED_ID_BY_PROVIDER[c.provider]?.test(c.id) ?? false)

// Live list fields win where they are known; models.dev fills the gaps
// (notably prices). Deprecation from either source drops the model.
const merge = (live: CandidateModel, meta: CandidateModel | undefined): CandidateModel => {
  if (!meta) return live
  const pick = <K extends keyof CandidateModel>(k: K): CandidateModel[K] => live[k] ?? meta[k]
  return {
    provider: live.provider,
    id: live.id,
    label: pick("label"),
    releasedAt: pick("releasedAt"),
    inputCost: pick("inputCost"),
    outputCost: pick("outputCost"),
    toolCall: pick("toolCall"),
    structuredOutput: pick("structuredOutput"),
    textOnlyOutput: pick("textOnlyOutput"),
    deprecated: live.deprecated || meta.deprecated,
    experimental: live.experimental || meta.experimental,
    line: pick("line")
  }
}

// Drop dated/numbered snapshots when the plain alias is also listed
// (claude-opus-4-5-20251101 vs claude-opus-4-5, gemini-x-001 vs gemini-x), and
// entries that share a display name (keep the shorter id).
const dedupe = (models: CandidateModel[]): CandidateModel[] => {
  const ids = new Set(models.map((m) => m.id))
  const noSnapshots = models.filter((m) => {
    const base = m.id.match(/^(.*)-(\d{8}|\d{3})$/)?.[1]
    return !(base && ids.has(base))
  })
  const byLabel = new Map<string, CandidateModel>()
  for (const m of noSnapshots) {
    const key = (m.label ?? m.id).toLowerCase().replace(/\(latest\)/g, "").trim()
    const kept = byLabel.get(key)
    if (!kept || m.id.length < kept.id.length) byLabel.set(key, m)
  }
  return [...byLabel.values()]
}

// Model family = the id without its version tokens:
//   claude-opus-5-5 → claude-opus · gpt-6.1-sol → gpt-sol · gemini-3.8-flash → gemini-flash
// ("preview"/"exp" are not part of the family, so a GA release supersedes its preview.)
// A newer release in a family supersedes the older ones, so a new version
// replaces its predecessor in the picker without anyone editing a list.
// MODEL_CATALOG_ALL_VERSIONS=true keeps every version instead.
export const familyOf = (id: string): string =>
  id
    .split("-")
    .filter((part) => !/^\d+(\.\d+)*$/.test(part) && !/^(preview|exp)$/i.test(part))
    .join("-")

const newestPerFamily = (models: CandidateModel[]): CandidateModel[] => {
  if (process.env.MODEL_CATALOG_ALL_VERSIONS === "true") return models
  const seen = new Set<string>()
  return [...models].sort(newestFirst).filter((m) => {
    const family = familyOf(m.id)
    if (seen.has(family)) return false
    seen.add(family)
    return true
  })
}

function newestFirst(a: CandidateModel, b: CandidateModel): number {
  return (b.releasedAt ?? "").localeCompare(a.releasedAt ?? "") || a.id.localeCompare(b.id)
}


// Blended list price, weighting input 3:1 like a typical analysis request.
const blendedPrice = (m: CandidateModel): number | null =>
  m.inputCost !== null && m.outputCost !== null ? (3 * m.inputCost + m.outputCost) / 4 : null

// Fallback when a model has no price: the Anthropic line, else the middle.
const LINE_TIER: Record<string, ModelEntry["tier"]> = {
  haiku: "low",
  sonnet: "medium",
  opus: "high",
  fable: "high",
  mythos: "high"
}

// Tiers are RELATIVE: thirds of the current catalog by blended price, so they
// stay meaningful as list prices fall over time.
const assignTiers = (models: CandidateModel[]): Map<CandidateModel, ModelEntry["tier"]> => {
  const priced = models
    .map((m) => ({ m, p: blendedPrice(m) }))
    .filter((x): x is { m: CandidateModel; p: number } => x.p !== null)
    .sort((a, b) => a.p - b.p)
  const tiers = new Map<CandidateModel, ModelEntry["tier"]>()
  const n = priced.length
  priced.forEach(({ m, p }) => {
    const rank = priced.findIndex((x) => x.p === p) // ties share a tier
    tiers.set(m, rank < n / 3 ? "low" : rank >= (2 * n) / 3 ? "high" : "medium")
  })
  for (const m of models) {
    if (!tiers.has(m)) tiers.set(m, LINE_TIER[m.line ?? ""] ?? "medium")
  }
  return tiers
}

const labelFor = (m: CandidateModel): string => {
  const label = (m.label ?? m.id).replace(/\s*\(latest\)\s*/i, "").trim()
  return /preview/i.test(m.id) && !/preview/i.test(label) ? `${label} (preview)` : label
}

// DEFAULT_MODEL (e.g. "claude-haiku-5-5" or "anthropic:claude-haiku-5-5") pins
// the default; otherwise the newest low-tier Anthropic model, then the cheapest.
const chooseServerDefault = (
  anthropic: ModelEntry[],
  priceOf: (id: string) => number | null
): string | null => {
  const pinned = process.env.DEFAULT_MODEL?.trim().replace(/^anthropic:/, "")
  if (pinned && anthropic.some((m) => m.id === pinned)) return pinned
  const low = anthropic.find((m) => m.tier === "low") // list is newest-first
  if (low) return low.id
  const cheapest = [...anthropic].sort(
    (a, b) => (priceOf(a.id) ?? Infinity) - (priceOf(b.id) ?? Infinity)
  )[0]
  return cheapest?.id ?? null
}

export interface BuildInput {
  modelsDev: Record<ProviderId, CandidateModel[]> | null // null = source failed
  live: Partial<Record<ProviderId, CandidateModel[]>> // only providers we could list
  previous: ModelCatalog | null // last-known-good, for per-provider fallback
  sources: Record<string, string>
  now: Date
}

export const buildCatalog = ({ modelsDev, live, previous, sources, now }: BuildInput): ModelCatalog => {
  const curated: Record<ProviderId, CandidateModel[]> = { anthropic: [], openai: [], gemini: [] }

  for (const provider of PROVIDERS) {
    const meta = new Map((modelsDev?.[provider] ?? []).map((m) => [m.id, m]))
    const liveList = live[provider]
    let candidates: CandidateModel[]
    if (liveList) {
      // The provider's own list decides availability. Anthropic's list carries
      // enough metadata on its own; for OpenAI/Gemini a live id is only kept
      // when models.dev describes it (their lists include legacy and
      // non-chat models with no capability data).
      candidates = liveList
        .filter((m) => provider === "anthropic" || meta.has(m.id))
        .map((m) => merge(m, meta.get(m.id)))
    } else {
      candidates = [...meta.values()]
    }
    curated[provider] = newestPerFamily(dedupe(candidates.filter(isUsable))).slice(0, maxPerProvider())
  }

  const all = PROVIDERS.flatMap((p) => curated[p])
  const tiers = assignTiers(all)
  const prices = new Map(all.map((m) => [`${m.provider}:${m.id}`, blendedPrice(m)]))

  const providers = { anthropic: [], openai: [], gemini: [] } as Record<ProviderId, ModelEntry[]>
  for (const provider of PROVIDERS) {
    if (curated[provider].length === 0) {
      // A source outage must never empty the picker: keep the last good list.
      providers[provider] = previous?.providers[provider] ?? SEED_CATALOG.providers[provider]
      sources[`${provider}.fallback`] = previous ? "kept previous list" : "used seed list"
      continue
    }
    providers[provider] = curated[provider].map((m) => ({
      id: m.id,
      label: labelFor(m),
      tier: tiers.get(m) ?? "medium",
      releasedAt: m.releasedAt
    }))
  }

  const defaultModel =
    chooseServerDefault(providers.anthropic, (id) => prices.get(`anthropic:${id}`) ?? null) ??
    previous?.serverDefault.model ??
    SEED_CATALOG.serverDefault.model

  return {
    providers,
    serverDefault: { provider: "anthropic", model: defaultModel },
    refreshedAt: now.toISOString(),
    sources
  }
}

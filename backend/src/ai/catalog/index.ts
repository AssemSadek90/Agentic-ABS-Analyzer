import { sql } from "../../db/client"
import type { ProviderId } from "../provider"
import { buildCatalog } from "./build"
import { SEED_CATALOG } from "./seed"
import {
  fetchAnthropicModels,
  fetchGeminiModels,
  fetchModelsDev,
  fetchOpenAIModelIds
} from "./sources"
import type { CandidateModel, ModelCatalog } from "./types"

export type { ModelCatalog, ModelEntry } from "./types"

// Dynamic model catalog service.
//
//   sources (provider List Models APIs + models.dev)
//     → buildCatalog() curation
//     → model_catalog row in Postgres (last-known-good, shared by all instances)
//     → short in-memory cache per instance
//
// Refreshes: a daily Vercel Cron call (routes/cron.ts), plus stale-while-
// revalidate when a read finds the stored catalog older than the TTL (covers
// local Docker, which has no cron). A failed refresh never replaces a good
// catalog; with nothing stored and every source down, the seed list is used.

const TTL_MS = (Number(process.env.MODEL_CATALOG_TTL_HOURS) || 24) * 60 * 60 * 1000
// How long an instance trusts its in-memory copy before re-reading the DB, so
// a refresh done by the cron (another instance) propagates within minutes.
const MEMO_MS = 5 * 60 * 1000

let memo: { catalog: ModelCatalog; at: number } | null = null
let inflight: Promise<ModelCatalog> | null = null
let warnedNoTable = false

const readStored = async (): Promise<ModelCatalog | null> => {
  try {
    const rows = await sql<{ catalog: ModelCatalog }[]>`SELECT catalog FROM model_catalog WHERE id = 1`
    return rows[0]?.catalog ?? null
  } catch (err) {
    // e.g. migration 006 not applied yet: work from memory, warn once.
    if (!warnedNoTable) {
      console.warn("Model catalog: could not read model_catalog (run migrations?):", (err as Error).message)
      warnedNoTable = true
    }
    return null
  }
}

const writeStored = async (catalog: ModelCatalog): Promise<void> => {
  try {
    await sql`
      INSERT INTO model_catalog (id, catalog, refreshed_at)
      VALUES (1, ${sql.json(catalog as never)}, ${catalog.refreshedAt})
      ON CONFLICT (id) DO UPDATE SET catalog = EXCLUDED.catalog, refreshed_at = EXCLUDED.refreshed_at
    `
  } catch (err) {
    console.warn("Model catalog: could not persist refresh:", (err as Error).message)
  }
}

const isStale = (c: ModelCatalog): boolean => Date.now() - Date.parse(c.refreshedAt) > TTL_MS

const settle = async <T>(
  name: string,
  sources: Record<string, string>,
  run: (() => Promise<T>) | null
): Promise<T | null> => {
  if (!run) {
    sources[name] = "skipped (no server key)"
    return null
  }
  try {
    const value = await run()
    sources[name] = "ok"
    return value
  } catch (err) {
    sources[name] = `error: ${(err as Error).message}`.slice(0, 200)
    console.warn(`Model catalog: source ${name} failed:`, (err as Error).message)
    return null
  }
}

const doRefresh = async (): Promise<ModelCatalog> => {
  const previous = memo?.catalog ?? (await readStored())
  const sources: Record<string, string> = {}
  const key = (name: string): string | undefined => process.env[name]?.trim() || undefined
  const anthropicKey = key("ANTHROPIC_API_KEY")
  const openaiKey = key("OPENAI_API_KEY")
  const geminiKey = key("GEMINI_API_KEY")

  const [modelsDev, anthropic, openai, gemini] = await Promise.all([
    settle("models.dev", sources, fetchModelsDev),
    settle("anthropic", sources, anthropicKey ? () => fetchAnthropicModels(anthropicKey) : null),
    settle("openai", sources, openaiKey ? () => fetchOpenAIModelIds(openaiKey) : null),
    settle("gemini", sources, geminiKey ? () => fetchGeminiModels(geminiKey) : null)
  ])

  const live: Partial<Record<ProviderId, CandidateModel[]>> = {}
  if (anthropic) live.anthropic = anthropic
  if (openai) live.openai = openai
  if (gemini) live.gemini = gemini

  if (!modelsDev && Object.keys(live).length === 0) {
    throw new Error(`every model source failed: ${JSON.stringify(sources)}`)
  }

  const catalog = buildCatalog({ modelsDev, live, previous, sources, now: new Date() })
  await writeStored(catalog)
  memo = { catalog, at: Date.now() }
  return catalog
}

// Rebuild now (deduplicated per instance). Throws only if every source failed.
export const refreshCatalog = (): Promise<ModelCatalog> => {
  inflight ??= doRefresh().finally(() => {
    inflight = null
  })
  return inflight
}

// The current catalog. Never throws: falls back to last-known-good, then seed.
export const getCatalog = async (): Promise<ModelCatalog> => {
  if (memo && Date.now() - memo.at < MEMO_MS) return memo.catalog

  const stored = await readStored()
  if (stored) {
    memo = { catalog: stored, at: Date.now() }
    if (isStale(stored)) {
      // Serve the stored list now; rebuild in the background.
      refreshCatalog().catch((err) => console.warn("Model catalog: background refresh failed:", err))
    }
    return stored
  }

  // Nothing stored yet (first boot): build synchronously, bounded by source timeouts.
  try {
    return await refreshCatalog()
  } catch (err) {
    console.warn("Model catalog: initial build failed, using seed list:", err)
    memo = { catalog: SEED_CATALOG, at: Date.now() } // retry after MEMO_MS
    return SEED_CATALOG
  }
}

export const isCatalogModel = (catalog: ModelCatalog, provider: ProviderId, model: string): boolean =>
  catalog.providers[provider].some((m) => m.id === model) ||
  (catalog.serverDefault.provider === provider && catalog.serverDefault.model === model)

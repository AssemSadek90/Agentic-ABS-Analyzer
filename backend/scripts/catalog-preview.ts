// Prints the model catalog the next refresh would build, without touching the
// database. Uses ANTHROPIC_API_KEY (and OPENAI_API_KEY / GEMINI_API_KEY when
// set) exactly like the backend does.
//
// Usage: npx tsx --env-file=../.env scripts/catalog-preview.ts   (npm run catalog:preview)
import { buildCatalog } from "../src/ai/catalog/build"
import {
  fetchAnthropicModels,
  fetchGeminiModels,
  fetchModelsDev,
  fetchOpenAIModelIds
} from "../src/ai/catalog/sources"
import type { CandidateModel } from "../src/ai/catalog/types"
import type { ProviderId } from "../src/ai/provider"

const attempt = async <T>(name: string, sources: Record<string, string>, run?: () => Promise<T>) => {
  if (!run) {
    sources[name] = "skipped (no key)"
    return null
  }
  try {
    const v = await run()
    sources[name] = "ok"
    return v
  } catch (err) {
    sources[name] = `error: ${(err as Error).message}`
    return null
  }
}

const main = async () => {
  const sources: Record<string, string> = {}
  const { ANTHROPIC_API_KEY: a, OPENAI_API_KEY: o, GEMINI_API_KEY: g } = process.env
  const [modelsDev, anthropic, openai, gemini] = await Promise.all([
    attempt("models.dev", sources, fetchModelsDev),
    attempt("anthropic", sources, a ? () => fetchAnthropicModels(a) : undefined),
    attempt("openai", sources, o ? () => fetchOpenAIModelIds(o) : undefined),
    attempt("gemini", sources, g ? () => fetchGeminiModels(g) : undefined)
  ])
  const live: Partial<Record<ProviderId, CandidateModel[]>> = {}
  if (anthropic) live.anthropic = anthropic
  if (openai) live.openai = openai
  if (gemini) live.gemini = gemini

  const catalog = buildCatalog({ modelsDev, live, previous: null, sources, now: new Date() })
  console.log("sources:", catalog.sources)
  console.log("server default:", catalog.serverDefault)
  for (const [provider, models] of Object.entries(catalog.providers)) {
    console.log(`\n${provider}`)
    for (const m of models) console.log(`  ${m.tier.padEnd(6)} ${m.id.padEnd(28)} ${m.label.padEnd(28)} ${m.releasedAt ?? ""}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

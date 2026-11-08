import type { ProviderId, QualitativeProvider } from "./provider"
import { anthropicProvider } from "./providers/anthropic"
import { openaiProvider } from "./providers/openai"
import { geminiProvider } from "./providers/gemini"

// The model allowlist is no longer hardcoded here: it is the dynamic catalog
// in ./catalog (built from the providers' List Models APIs + models.dev and
// refreshed daily). Users still pick only from that list, never freeform ids.

export const PROVIDER_IDS: readonly ProviderId[] = ["anthropic", "openai", "gemini"]

export const isProviderId = (value: string): value is ProviderId =>
  (PROVIDER_IDS as readonly string[]).includes(value)

const providers: Record<ProviderId, QualitativeProvider> = {
  anthropic: anthropicProvider,
  openai: openaiProvider,
  gemini: geminiProvider
}

export const getProvider = (id: ProviderId): QualitativeProvider => providers[id]

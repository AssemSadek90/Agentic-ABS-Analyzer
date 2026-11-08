import type { ModelCatalog } from "./types"

// LAST-RESORT fallback only. The live catalog is built from the providers'
// List Models APIs + models.dev (see ./index.ts) and refreshed daily; this list
// is used only when no catalog was ever stored AND every live source is
// unreachable. It does not need routine maintenance: once a refresh succeeds,
// the stored catalog (last-known-good) takes over and this is never read.
// Snapshot taken 2026-11-08 from the live sources.
export const SEED_CATALOG: ModelCatalog = {
  providers: {
    anthropic: [
      { id: "claude-opus-5-5", label: "Claude Opus 5.5", tier: "high", releasedAt: "2026-09-21" },
      { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", tier: "medium", releasedAt: "2026-09-28" },
      { id: "claude-haiku-5-5", label: "Claude Haiku 5.5", tier: "low", releasedAt: "2026-10-07" }
    ],
    openai: [
      { id: "gpt-6-astra", label: "GPT-6 Astra", tier: "high", releasedAt: "2026-09-04" },
      { id: "gpt-6.1-sol", label: "GPT-6.1 Sol", tier: "medium", releasedAt: "2026-09-29" },
      { id: "gpt-6-luna", label: "GPT-6 Luna", tier: "low", releasedAt: "2026-09-22" }
    ],
    gemini: [
      { id: "gemini-4-argon", label: "Gemini 4 Argon", tier: "medium", releasedAt: "2026-10-13" },
      { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash", tier: "medium", releasedAt: "2026-09-02" },
      { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash Lite", tier: "low", releasedAt: "2026-07-21" }
    ]
  },
  serverDefault: { provider: "anthropic", model: "claude-haiku-5-5" },
  refreshedAt: "2026-11-08T00:00:00.000Z",
  sources: { seed: "static fallback" }
}

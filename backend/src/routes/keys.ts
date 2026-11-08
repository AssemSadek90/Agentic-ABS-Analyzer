import { Router } from "express"
import { encryptSecret } from "../ai/crypto"
import { isProviderId } from "../ai/registry"
import { validateAnthropicKey } from "../ai/providers/anthropic"
import { validateOpenAIKey } from "../ai/providers/openai"
import { validateGeminiKey } from "../ai/providers/gemini"
import type { ProviderId } from "../ai/provider"
import { deleteProviderKey, listProviderKeys, upsertProviderKey } from "../db/queries"

export const keysRouter = Router()

const validators: Record<ProviderId, (apiKey: string) => Promise<boolean>> = {
  anthropic: validateAnthropicKey,
  openai: validateOpenAIKey,
  gemini: validateGeminiKey
}

const PROVIDER_LABEL: Record<ProviderId, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  gemini: "Google Gemini"
}

// GET /api/keys — provider + last4 + createdAt only; keys are write-only (§S.3).
keysRouter.get("/keys", async (req, res) => {
  try {
    return res.json(await listProviderKeys(req.user!.id))
  } catch (err) {
    console.error("Key list failed:", err)
    return res.status(500).json({ error: "Internal Server Error" })
  }
})

// PUT /api/keys/:provider — live-validate, encrypt, upsert. 204 on success.
keysRouter.put("/keys/:provider", async (req, res) => {
  const { provider } = req.params
  if (!isProviderId(provider)) {
    return res.status(400).json({ error: "Unknown provider" })
  }
  const apiKey =
    typeof (req.body as Record<string, unknown> | undefined)?.apiKey === "string"
      ? ((req.body as Record<string, string>).apiKey ?? "").trim()
      : ""
  if (!apiKey) {
    return res.status(400).json({ error: "apiKey is required" })
  }

  try {
    const valid = await validators[provider](apiKey)
    if (!valid) {
      return res.status(400).json({ error: `${PROVIDER_LABEL[provider]} rejected this API key` })
    }
  } catch (err) {
    // Validation call itself failed (network/5xx). Never log the key material.
    console.error(
      "Key validation call failed, status:",
      (err as { status?: number }).status ?? "n/a"
    )
    return res.status(502).json({ error: "Could not reach the provider to validate the key. Try again." })
  }

  try {
    await upsertProviderKey(req.user!.id, provider, encryptSecret(apiKey), apiKey.slice(-4))
    return res.status(204).end()
  } catch (err) {
    console.error("Key store failed:", err)
    return res.status(500).json({ error: "Internal Server Error" })
  }
})

// DELETE /api/keys/:provider — idempotent.
keysRouter.delete("/keys/:provider", async (req, res) => {
  const { provider } = req.params
  if (!isProviderId(provider)) {
    return res.status(400).json({ error: "Unknown provider" })
  }
  try {
    await deleteProviderKey(req.user!.id, provider)
    return res.status(204).end()
  } catch (err) {
    console.error("Key delete failed:", err)
    return res.status(500).json({ error: "Internal Server Error" })
  }
})

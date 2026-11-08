import { decryptSecret } from "./crypto"
import { isProviderId } from "./registry"
import { getCatalog, isCatalogModel } from "./catalog"
import type { ProviderId } from "./provider"
import { getProviderKeyEncrypted } from "../db/queries"

export class SelectionError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = "SelectionError"
    this.status = status
  }
}

export interface ResolvedSelection {
  provider: ProviderId
  model: string
  apiKey: string
  keySource: "user" | "server"
}

// §S.4 selection rule:
// - nothing named        → server default (newest low-cost Anthropic model)
// - {provider, model}    → must be in the current model catalog (400 otherwise)
// - key = the user's stored key for that provider; anthropic (only) falls back
//   to the platform demo key when the user has none.
export const resolveSelection = async (
  userId: string,
  providerRaw: unknown,
  modelRaw: unknown
): Promise<ResolvedSelection> => {
  const hasProvider = typeof providerRaw === "string" && providerRaw.trim() !== ""
  const hasModel = typeof modelRaw === "string" && modelRaw.trim() !== ""

  let provider: ProviderId
  let model: string
  if (!hasProvider && !hasModel) {
    const catalog = await getCatalog()
    provider = catalog.serverDefault.provider
    model = catalog.serverDefault.model
  } else if (hasProvider && hasModel) {
    const candidate = (providerRaw as string).trim()
    if (!isProviderId(candidate)) {
      throw new SelectionError(400, `Unknown provider "${candidate}"`)
    }
    provider = candidate
    model = (modelRaw as string).trim()
    if (!isCatalogModel(await getCatalog(), provider, model)) {
      throw new SelectionError(
        400,
        `Model "${model}" is no longer in the supported model list. Pick another model.`
      )
    }
  } else {
    throw new SelectionError(400, "provider and model must be supplied together")
  }

  const encrypted = await getProviderKeyEncrypted(userId, provider)
  if (encrypted) {
    return { provider, model, apiKey: decryptSecret(encrypted), keySource: "user" }
  }
  if (provider === "anthropic") {
    const serverKey = process.env.ANTHROPIC_API_KEY
    if (serverKey) {
      return { provider, model, apiKey: serverKey, keySource: "server" }
    }
    throw new SelectionError(400, "No Anthropic API key available. Add one in Settings.")
  }
  throw new SelectionError(400, `No ${provider} API key stored. Add one in Settings.`)
}

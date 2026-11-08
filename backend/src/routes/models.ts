import { Router } from "express"
import { PROVIDER_IDS } from "../ai/registry"
import { getCatalog } from "../ai/catalog"
import { listProviderKeys } from "../db/queries"

export const modelsRouter = Router()

// GET /api/models — the dynamic catalog grouped by provider, flags for which
// providers the user has stored keys, the server default (platform demo key)
// and when the catalog was last rebuilt.
modelsRouter.get("/models", async (req, res) => {
  try {
    const [keys, catalog] = await Promise.all([listProviderKeys(req.user!.id), getCatalog()])
    const withKey = new Set(keys.map((k) => k.provider))
    return res.json({
      providers: PROVIDER_IDS.map((id) => ({
        id,
        models: catalog.providers[id],
        hasKey: withKey.has(id)
      })),
      serverDefault: catalog.serverDefault,
      refreshedAt: catalog.refreshedAt
    })
  } catch (err) {
    console.error("Models read failed:", err)
    return res.status(500).json({ error: "Internal Server Error" })
  }
})

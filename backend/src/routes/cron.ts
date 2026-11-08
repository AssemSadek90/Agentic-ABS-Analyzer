import { timingSafeEqual } from "node:crypto"
import { Router } from "express"
import { refreshCatalog } from "../ai/catalog"

export const cronRouter = Router()

// Vercel Cron calls these with `Authorization: Bearer $CRON_SECRET` (it sends
// the header automatically when the project has a CRON_SECRET env var). The
// same header works for a manual trigger. Without CRON_SECRET the endpoint is
// disabled rather than left open.
const authorized = (header: string | undefined): boolean => {
  const secret = process.env.CRON_SECRET
  if (!secret || !header) return false
  const a = Buffer.from(header)
  const b = Buffer.from(`Bearer ${secret}`)
  return a.length === b.length && timingSafeEqual(a, b)
}

// GET /api/cron/refresh-models — rebuild the model catalog from the live sources.
cronRouter.get("/refresh-models", async (req, res) => {
  if (!process.env.CRON_SECRET) return res.status(503).json({ error: "CRON_SECRET is not configured" })
  if (!authorized(req.get("authorization"))) return res.status(401).json({ error: "Unauthorized" })
  try {
    const catalog = await refreshCatalog()
    return res.json({
      refreshedAt: catalog.refreshedAt,
      sources: catalog.sources,
      serverDefault: catalog.serverDefault,
      models: Object.fromEntries(
        Object.entries(catalog.providers).map(([p, models]) => [p, models.map((m) => m.id)])
      )
    })
  } catch (err) {
    console.error("Model catalog refresh failed:", err)
    return res.status(502).json({ error: "Every model source failed; the previous catalog was kept." })
  }
})

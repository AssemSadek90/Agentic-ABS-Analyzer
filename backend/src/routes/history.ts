import { Router } from "express"
import { getHistory, getRunById } from "../db/queries"
import type { HistoryResponse } from "../types"

export const historyRouter = Router()

// GET /api/history?page=1&limit=10 — paginated list of past runs (newest first).
historyRouter.get("/history", async (req, res) => {
  const page = Math.max(1, Number.parseInt(String(req.query.page ?? "1"), 10) || 1)
  const rawLimit = Number.parseInt(String(req.query.limit ?? "10"), 10) || 10
  const limit = Math.min(50, Math.max(1, rawLimit)) // default 10, max 50

  try {
    const { runs, total } = await getHistory(req.user!.id, page, limit)
    const response: HistoryResponse = { runs, total, page, limit }
    return res.json(response)
  } catch (err) {
    console.error("DB error reading history:", err)
    return res.status(500).json({ error: "Internal Server Error" })
  }
})

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// GET /api/history/:id — full reconstructed analysis for one run.
historyRouter.get("/history/:id", async (req, res) => {
  const { id } = req.params
  if (!UUID_RE.test(id)) {
    return res.status(400).json({ error: "Invalid run id" })
  }

  try {
    const run = await getRunById(id, req.user!.id)
    if (!run) {
      return res.status(404).json({ error: "Run not found" })
    }
    return res.json(run)
  } catch (err) {
    console.error("DB error reading run:", err)
    return res.status(500).json({ error: "Internal Server Error" })
  }
})

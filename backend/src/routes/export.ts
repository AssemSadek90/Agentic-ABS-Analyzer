import { Router } from "express"
import { getRunById } from "../db/queries"
import { buildXlsx } from "../export/xlsx"
import { buildPdf } from "../export/pdf"

export const exportRouter = Router()

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// GET /api/history/:id/export?format=xlsx|pdf — investor-ready document built
// from the DB (never client state), ownership-scoped.
exportRouter.get("/history/:id/export", async (req, res) => {
  const { id } = req.params
  if (!UUID_RE.test(id)) return res.status(400).json({ error: "Invalid run id" })

  const format = req.query.format
  if (format !== "xlsx" && format !== "pdf") {
    return res.status(400).json({ error: "format must be xlsx or pdf" })
  }

  try {
    const run = await getRunById(id, req.user!.id)
    if (!run) return res.status(404).json({ error: "Run not found" })

    const short = id.slice(0, 8)
    if (format === "xlsx") {
      const buf = await buildXlsx(run)
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      res.setHeader("Content-Disposition", `attachment; filename="abs-analysis-${short}.xlsx"`)
      return res.send(buf)
    }
    const buf = await buildPdf(run)
    res.setHeader("Content-Type", "application/pdf")
    res.setHeader("Content-Disposition", `attachment; filename="abs-analysis-${short}.pdf"`)
    return res.send(buf)
  } catch (err) {
    console.error("Export failed:", err)
    return res.status(500).json({ error: "Could not generate the export" })
  }
})

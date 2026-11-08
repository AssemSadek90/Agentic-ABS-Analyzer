import { Router } from "express"
import multer from "multer"
import { Effect } from "effect"
import { parseCsv } from "../pipeline/parse"
import { validateRows } from "../pipeline/validate"
import { computeMetrics } from "../metrics/compute"
import {
  ProviderAuthError,
  type QualitativeAnalysis,
  type QualitativeResult
} from "../ai/provider"
import { getProvider } from "../ai/registry"
import { SelectionError, resolveSelection, type ResolvedSelection } from "../ai/selection"
import { evaluateRules } from "../rules/engine"
import type { PoolMetrics } from "../metrics/compute"
import type { ValidatedAssetRow } from "../pipeline/schema"
import { persistAnalysisRun, flattenValidationErrors } from "../db/queries"
import type { AnalyzeResponse, AnalysisDTO, RuleResultDTO, RunStatus } from "../types"

export const analyzeRouter = Router()

// Accept a CSV file upload (multipart) up to 10 MB; JSON { csvContent } is
// handled by the app-level express.json() middleware.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
})

const computeStatus = (validCount: number, errorRowCount: number): RunStatus => {
  if (validCount === 0) return "failed"
  if (errorRowCount > 0) return "partial"
  return "success"
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

// Call the selected LLM, retrying once after a 2s delay before giving up (§7).
// A rejected API key is never retried — it cannot succeed the second time.
const runAiWithRetry = async (
  selection: ResolvedSelection,
  metrics: PoolMetrics,
  validRows: ValidatedAssetRow[],
  validationSummary: string,
  ruleResults: RuleResultDTO[]
): Promise<QualitativeResult> => {
  const provider = getProvider(selection.provider)
  const call = () =>
    provider.runQualitativeAnalysis({
      metrics,
      validRows,
      validationSummary,
      ruleResults,
      model: selection.model,
      apiKey: selection.apiKey
    })
  try {
    return await call()
  } catch (err) {
    if (err instanceof ProviderAuthError) throw err
    console.warn("AI analysis failed; retrying once in 2s…", err)
    await sleep(2000)
    return call()
  }
}

const toAnalysisDTO = (
  metrics: PoolMetrics,
  analysis: QualitativeAnalysis,
  selection: ResolvedSelection
): AnalysisDTO => ({
  provider: selection.provider,
  model: selection.model,
  totalPoolVolume: metrics.totalPoolVolume,
  weightedAvgRate: metrics.weightedAvgRate,
  weightedAvgLtv: metrics.weightedAvgLtv,
  avgRemainingTenor: metrics.avgRemainingTenor,
  delinquencyRate: metrics.delinquencyRate,
  concentrationTop5: metrics.concentrationTop5,
  obligorTop1: metrics.obligorTop1,
  obligorTop5: metrics.obligorTop5,
  assetTypeBreakdown: metrics.assetTypeBreakdown,
  countryBreakdown: metrics.countryBreakdown,
  // map the LLM's snake_case onto the camelCase wire format
  esmaFlags: analysis.esma_flags.map((f) => ({
    code: f.code,
    severity: f.severity,
    message: f.message,
    affectedRows: f.affected_rows
  })),
  riskSignals: analysis.risk_signals.map((s) => ({
    type: s.type,
    severity: s.severity,
    description: s.description,
    recommendation: s.recommendation
  })),
  executiveSummary: analysis.executive_summary
})

analyzeRouter.post("/analyze", upload.single("file"), async (req, res) => {
  // requireAuth (mounted ahead of this router) guarantees req.user.
  const userId = req.user!.id

  // 0. Resolve the provider/model/key selection (§S.4) — cheap 400s before any
  // heavy work. Works for both JSON and multipart bodies (multer fills req.body).
  let selection: ResolvedSelection
  try {
    const body = (req.body ?? {}) as Record<string, unknown>
    selection = await resolveSelection(userId, body.provider, body.model)
  } catch (err) {
    if (err instanceof SelectionError) {
      return res.status(err.status).json({ error: err.message })
    }
    console.error("Selection resolution failed:", err)
    return res.status(500).json({ error: "Internal Server Error" })
  }

  // 1. Resolve CSV content + filename from either a file upload or JSON body.
  let csvContent: string | undefined
  let filename: string | null = null
  if (req.file) {
    csvContent = req.file.buffer.toString("utf-8")
    filename = req.file.originalname || null
  } else if (req.body && typeof req.body.csvContent === "string") {
    csvContent = req.body.csvContent
    filename = typeof req.body.filename === "string" ? req.body.filename : null
  }
  if (!csvContent || csvContent.trim() === "") {
    return res.status(400).json({ error: "No file or csvContent provided" })
  }

  // 2. Parse + validate (deterministic core).
  let rowCount: number
  let validRows: ValidatedAssetRow[]
  let flatErrors: AnalyzeResponse["validationErrors"]
  let errorRowCount: number
  let rawCsv: string
  try {
    const parsed = parseCsv(csvContent)
    rawCsv = parsed.rawCsv
    rowCount = parsed.rows.length
    const validated = Effect.runSync(validateRows(parsed.rows))
    validRows = validated.validRows
    errorRowCount = validated.errors.length
    flatErrors = flattenValidationErrors(validated.errors)
  } catch (err) {
    console.error("CSV parse/validate failed:", err)
    return res.status(400).json({ error: "Could not parse CSV", detail: String(err) })
  }

  const validRowCount = validRows.length
  const status = computeStatus(validRowCount, errorRowCount)

  // 3. FAILED (zero valid rows): persist the run + errors, return 422, no AI call.
  if (validRowCount === 0) {
    try {
      const persisted = await persistAnalysisRun({
        userId,
        filename,
        rowCount,
        validRowCount,
        status,
        rawCsv,
        flatErrors,
        metrics: null,
        analysis: null,
        rawAi: null,
        provider: null,
        model: null,
        ruleResults: []
      })
      const response: AnalyzeResponse = {
        run: { id: persisted.id, createdAt: persisted.createdAt, filename, rowCount, validRowCount, status },
        validationErrors: flatErrors,
        ruleResults: [],
        analysis: null
      }
      return res.status(422).json(response)
    } catch (err) {
      console.error("DB error persisting failed run:", err)
      return res.status(500).json({ error: "Internal Server Error" })
    }
  }

  // 4. Compute metrics + deterministic compliance checks, then the AI layer.
  const metrics = computeMetrics(validRows)
  const ruleResults = evaluateRules(metrics, validRows)
  const validationSummary = `Validation summary: ${validRowCount} valid rows; ${flatErrors.length} validation error(s) across ${errorRowCount} skipped row(s).`

  let analysis: QualitativeAnalysis
  let rawAi: unknown
  try {
    const result = await runAiWithRetry(selection, metrics, validRows, validationSummary, ruleResults)
    analysis = result.analysis
    rawAi = result.raw
  } catch (err) {
    if (err instanceof ProviderAuthError) {
      const where = selection.keySource === "user" ? "Check your API key in Settings." : "The platform demo key is misconfigured."
      return res.status(502).json({ error: `The ${err.provider} API key was rejected by the provider. ${where}` })
    }
    console.error("AI analysis unavailable after retry:", err)
    return res.status(503).json({ error: "AI analysis unavailable" })
  }

  // 5. Persist the full run, then return the analysis.
  try {
    const persisted = await persistAnalysisRun({
      userId,
      filename,
      rowCount,
      validRowCount,
      status,
      rawCsv,
      flatErrors,
      metrics,
      analysis,
      rawAi,
      provider: selection.provider,
      model: selection.model,
      ruleResults
    })
    const response: AnalyzeResponse = {
      run: { id: persisted.id, createdAt: persisted.createdAt, filename, rowCount, validRowCount, status },
      validationErrors: flatErrors,
      ruleResults,
      analysis: toAnalysisDTO(metrics, analysis, selection)
    }
    return res.status(200).json(response)
  } catch (err) {
    console.error("DB error persisting run:", err)
    return res.status(500).json({ error: "Internal Server Error" })
  }
})

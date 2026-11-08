import ExcelJS from "exceljs"
import type { AnalyzeResponse } from "../types"
import { statusLabel } from "./format"

const PCT = "0.00%"
const EUR = '"€"#,##0'
const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF1E6B65" } // theme accent-dim
}

const headerRow = (ws: ExcelJS.Worksheet, values: string[]): void => {
  const row = ws.addRow(values)
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } }
    cell.fill = HEADER_FILL
  })
}

// Investor-ready workbook. Metrics are written as real numbers with Excel
// number formats (a 4.82% cell holds 0.0482 formatted as %, not a string), so
// the sheet stays analysable. Failed runs get Summary + Validation only.
export const buildXlsx = async (run: AnalyzeResponse): Promise<Buffer> => {
  const wb = new ExcelJS.Workbook()
  wb.creator = "ABS Analyzer"
  wb.created = new Date()

  const { run: meta, analysis, validationErrors, ruleResults = [] } = run

  // ── Summary ────────────────────────────────────────────────────────────
  const summary = wb.addWorksheet("Summary")
  summary.columns = [{ width: 26 }, { width: 42 }]
  summary.addRow(["ABS Analysis Report"]).font = { bold: true, size: 14 }
  summary.addRow([])
  summary.addRow(["Filename", meta.filename ?? "Pasted data"])
  summary.addRow(["Analyzed", new Date(meta.createdAt)])
  summary.getCell("B4").numFmt = "yyyy-mm-dd hh:mm"
  summary.addRow(["Status", statusLabel(meta.status)])
  summary.addRow(["Model", analysis?.model ?? "n/a"])
  summary.addRow(["Rows in file", meta.rowCount])
  summary.addRow(["Valid rows", meta.validRowCount])
  summary.addRow(["Validation errors", validationErrors.length])

  if (analysis) {
    summary.addRow([])
    headerRow(summary, ["Pool metric", "Value"])
    const metric = (name: string, value: number | null, fmt?: string): void => {
      const row = summary.addRow([name, value])
      if (value !== null && fmt) row.getCell(2).numFmt = fmt
      if (value === null) row.getCell(2).value = "N/A"
    }
    metric("Total pool volume", analysis.totalPoolVolume, EUR)
    metric("Weighted avg rate", analysis.weightedAvgRate, PCT)
    metric("Weighted avg LTV", analysis.weightedAvgLtv, PCT)
    metric("Avg remaining tenor (months)", analysis.avgRemainingTenor, "0.0")
    metric("Delinquency rate", analysis.delinquencyRate, PCT)
    metric("Top-5 concentration", analysis.concentrationTop5, PCT)
    if (analysis.obligorTop1 != null) metric("Top obligor", analysis.obligorTop1, PCT)
    if (analysis.obligorTop5 != null) metric("Top 5 obligors", analysis.obligorTop5, PCT)
    summary.addRow([])
    const es = summary.addRow(["Executive summary", analysis.executiveSummary])
    es.getCell(1).font = { bold: true }
    es.getCell(2).alignment = { wrapText: true, vertical: "top" }
  }

  // ── Compliance Checks (deterministic) ──────────────────────────────────
  if (ruleResults.length > 0) {
    const ws = wb.addWorksheet("Compliance Checks")
    ws.columns = [{ width: 24 }, { width: 10 }, { width: 8 }, { width: 12 }, { width: 12 }, { width: 60 }]
    headerRow(ws, ["Rule", "Severity", "Result", "Observed", "Threshold", "Message"])
    for (const r of ruleResults) {
      const row = ws.addRow([
        r.ruleCode,
        r.severity,
        r.passed ? "Pass" : "Fail",
        r.observedValue,
        r.thresholdValue,
        r.message
      ])
      if (r.observedValue !== null) row.getCell(4).numFmt = PCT
      if (r.thresholdValue !== null) row.getCell(5).numFmt = PCT
      row.getCell(3).font = { color: { argb: r.passed ? "FF1E6B65" : "FFB3261E" }, bold: true }
    }
  }

  // ── ESMA Flags (AI) ────────────────────────────────────────────────────
  if (analysis) {
    const ws = wb.addWorksheet("ESMA Flags")
    ws.columns = [{ width: 24 }, { width: 10 }, { width: 60 }, { width: 14 }]
    headerRow(ws, ["Code", "Severity", "Message", "Affected rows"])
    for (const f of analysis.esmaFlags) ws.addRow([f.code, f.severity, f.message, f.affectedRows])

    const rs = wb.addWorksheet("Risk Signals")
    rs.columns = [{ width: 24 }, { width: 10 }, { width: 50 }, { width: 50 }]
    headerRow(rs, ["Type", "Severity", "Description", "Recommendation"])
    for (const s of analysis.riskSignals) rs.addRow([s.type, s.severity, s.description, s.recommendation])
  }

  // ── Validation Errors ──────────────────────────────────────────────────
  {
    const ws = wb.addWorksheet("Validation Errors")
    ws.columns = [{ width: 8 }, { width: 16 }, { width: 20 }, { width: 22 }, { width: 60 }]
    headerRow(ws, ["Row", "Asset ID", "Field", "Type", "Message"])
    for (const e of validationErrors) {
      ws.addRow([e.rowNumber, e.assetId ?? "", e.field, e.errorType, e.message])
    }
  }

  const arrayBuffer = await wb.xlsx.writeBuffer()
  return Buffer.from(arrayBuffer)
}

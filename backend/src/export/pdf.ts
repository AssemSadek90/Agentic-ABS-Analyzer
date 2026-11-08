import PDFDocument from "pdfkit"
import type { AnalyzeResponse } from "../types"
import { dateTime, eur, months, pct, statusLabel } from "./format"

const TEAL = "#1E6B65"
const INK = "#1A1A2E"
const MUTED = "#57595f"
// Severity colors mirror the web app's badge palette.
const RED = "#D0323F" // error / high (web destructive, darkened for print)
const AMBER = "#B8860B" // warning / medium (web warning family, darkened for legibility)
const BLUE = "#3B6FD4" // info / low (web info)
const GREEN = TEAL // pass

const severityColor = (s: string): string =>
  s === "error" || s === "high" ? RED : s === "warning" || s === "medium" ? AMBER : BLUE

// "EARLY_ARREARS_SHARE" / "ESMA-FIELD-MISSING" / "collateral_quality" → sentence case.
const humanize = (code: string): string => {
  const s = code.replace(/[-_]+/g, " ").trim().toLowerCase()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// Branded, printable (light) investor report. Failed runs get header + meta +
// validation summary only.
export const buildPdf = (run: AnalyzeResponse): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50, bufferPages: true })
    const chunks: Buffer[] = []
    doc.on("data", (c: Buffer) => chunks.push(c))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)

    const { run: meta, analysis, validationErrors, ruleResults = [] } = run
    const left = doc.page.margins.left
    const width = doc.page.width - left - doc.page.margins.right
    const TAG_W = 80

    const sectionHeading = (text: string): void => {
      doc.moveDown(0.9)
      doc.fillColor(TEAL).font("Helvetica-Bold").fontSize(13.5).text(text)
      doc.moveDown(0.4)
    }

    // Bold, larger label + smaller value on one line ("Status: Success").
    const kv = (label: string, value: string): void => {
      doc
        .font("Helvetica-Bold")
        .fontSize(11)
        .fillColor(INK)
        .text(`${label}: `, { continued: true })
      doc.font("Helvetica").fontSize(11).fillColor(MUTED).text(value)
    }

    // A row with a color-coded status tag pinned to the right, a bold title on
    // the left, and an optional muted body paragraph beneath.
    const taggedRow = (title: string, tag: string, tagColor: string, body?: string): void => {
      const y = doc.y
      doc
        .font("Helvetica-Bold")
        .fontSize(11)
        .fillColor(tagColor)
        .text(tag.toUpperCase(), left, y, { width, align: "right" })
      doc
        .font("Helvetica-Bold")
        .fontSize(11)
        .fillColor(INK)
        .text(title, left, y, { width: width - TAG_W })
      if (body) {
        doc.font("Helvetica").fontSize(10).fillColor(MUTED).text(body, left, doc.y, { width })
      }
      doc.moveDown(0.4)
    }

    // Header
    doc.fillColor(TEAL).font("Helvetica-Bold").fontSize(20).text("ABS", { continued: true })
    doc.fillColor(MUTED).font("Helvetica").fontSize(20).text("  Analysis Report")
    doc.moveDown(0.5)
    doc
      .strokeColor(TEAL)
      .lineWidth(2)
      .moveTo(left, doc.y)
      .lineTo(left + width, doc.y)
      .stroke()
    doc.moveDown(0.9)

    // Run meta
    kv("File", meta.filename ?? "Pasted data")
    kv("Analyzed", dateTime(meta.createdAt))
    kv("Status", statusLabel(meta.status))
    kv("Rows", `${meta.validRowCount} valid of ${meta.rowCount} (${validationErrors.length} errors)`)
    if (analysis?.model) kv("Model", analysis.model)

    if (analysis) {
      sectionHeading("Executive summary")
      doc.font("Helvetica").fontSize(10).fillColor(INK).text(analysis.executiveSummary, { width })

      sectionHeading("Key metrics")
      const rows: Array<[string, string]> = [
        ["Total pool volume", eur(analysis.totalPoolVolume)],
        ["Weighted avg rate", pct(analysis.weightedAvgRate)],
        ["Weighted avg LTV", pct(analysis.weightedAvgLtv)],
        ["Avg remaining tenor", months(analysis.avgRemainingTenor)],
        ["Delinquency rate", pct(analysis.delinquencyRate)],
        ["Top-5 concentration", pct(analysis.concentrationTop5)]
      ]
      if (analysis.obligorTop1 != null) rows.push(["Top obligor", pct(analysis.obligorTop1)])
      if (analysis.obligorTop5 != null) rows.push(["Top 5 obligors", pct(analysis.obligorTop5)])
      for (const [label, value] of rows) kv(label, value)

      if (ruleResults.length > 0) {
        sectionHeading("Compliance checks (deterministic)")
        for (const r of ruleResults) {
          taggedRow(humanize(r.ruleCode), r.passed ? "Pass" : "Fail", r.passed ? GREEN : RED, r.message)
        }
      }

      if (analysis.esmaFlags.length > 0) {
        sectionHeading("ESMA compliance flags (AI assessment)")
        for (const f of analysis.esmaFlags) {
          taggedRow(
            humanize(f.code),
            f.severity,
            severityColor(f.severity),
            `${f.message} (${f.affectedRows} rows)`
          )
        }
      }

      if (analysis.riskSignals.length > 0) {
        sectionHeading("Risk signals (AI assessment)")
        for (const s of analysis.riskSignals) {
          const y = doc.y
          doc
            .font("Helvetica-Bold")
            .fontSize(11)
            .fillColor(severityColor(s.severity))
            .text(s.severity.toUpperCase(), left, y, { width, align: "right" })
          doc
            .font("Helvetica-Bold")
            .fontSize(11)
            .fillColor(INK)
            .text(humanize(s.type), left, y, { width: width - TAG_W })
          doc.font("Helvetica").fontSize(10).fillColor(MUTED).text(s.description, left, doc.y, { width })
          doc
            .font("Helvetica-Oblique")
            .fontSize(10)
            .fillColor(MUTED)
            .text(`Recommendation: ${s.recommendation}`, { width })
          doc.moveDown(0.5)
        }
      }
    }

    sectionHeading("Validation report")
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor(INK)
      .text(`${meta.validRowCount} valid rows, ${validationErrors.length} error(s) skipped.`, { width })
    if (analysis === null) {
      doc
        .fillColor(MUTED)
        .text("All rows failed validation, so no metrics or analysis were produced.", { width })
    }

    // Footer on every page. Writing inside the bottom margin makes PDFKit append
    // a blank page, so zero the bottom margin on each page while we draw it.
    const range = doc.bufferedPageRange()
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i)
      const savedBottom = doc.page.margins.bottom
      doc.page.margins.bottom = 0
      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor(MUTED)
        .text(`Run ${meta.id}  ·  generated ${dateTime(new Date().toISOString())}`, left, doc.page.height - 38, {
          width,
          align: "center",
          lineBreak: false
        })
      doc.page.margins.bottom = savedBottom
    }

    doc.end()
  })

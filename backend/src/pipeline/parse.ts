import Papa from "papaparse"
import type { RawAssetRow } from "./schema"

// CSV → raw row objects. We use papaparse with header:true so each row becomes
// a keyed object (RawAssetRow), and keep the raw CSV text around for later
// persistence (the run is stored verbatim for audit — see analysis_runs.raw_csv).
export interface ParseResult {
  rows: RawAssetRow[]
  rawCsv: string
}

export const parseCsv = (csvContent: string): ParseResult => {
  const result = Papa.parse<RawAssetRow>(csvContent, {
    header: true,
    skipEmptyLines: true, // a trailing newline must not produce a phantom all-empty row
    transformHeader: (h) => h.trim()
  })

  return {
    rows: result.data,
    rawCsv: csvContent
  }
}

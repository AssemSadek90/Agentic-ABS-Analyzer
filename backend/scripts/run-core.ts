// THROWAWAY runner for Chunk 2 — verifies parse → validate → computeMetrics in
// complete isolation (no DB, no AI, no HTTP). Later chunks do not depend on it.
//
// Run from backend/:  npm run core:sample
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { Effect } from "effect"
import { parseCsv } from "../src/pipeline/parse"
import { validateRows } from "../src/pipeline/validate"
import { computeMetrics } from "../src/metrics/compute"

// The npm script runs with cwd = backend/, so the sample sits one level up.
const csvPath = resolve(process.cwd(), "../sample_data/sample_pool.csv")
const csv = readFileSync(csvPath, "utf-8")

const { rows } = parseCsv(csv)
const { validRows, errors } = Effect.runSync(validateRows(rows))
const metrics = computeMetrics(validRows)

// errorCount is the total number of individual validation errors across all
// rows (the gate expects 5: 1 duplicate on row 11 + 4 accumulated on row 12).
const errorCount = errors.reduce((sum, e) => sum + e.errors.length, 0)

console.log(
  JSON.stringify(
    {
      validRowCount: validRows.length,
      errorCount,
      errors,
      metrics
    },
    null,
    2
  )
)

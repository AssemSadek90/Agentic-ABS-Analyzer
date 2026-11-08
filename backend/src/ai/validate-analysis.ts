import type { QualitativeAnalysis } from "./provider"

// Shared, provider-independent validation of the parsed LLM output. Providers
// enforce the schema at the transport level (forced tool / strict json_schema /
// responseSchema), but a malformed response must still fail loudly here rather
// than persist garbage. Returns a NORMALIZED object containing only the
// contract's fields.

const FLAG_SEVERITIES = ["error", "warning", "info"] as const
const SIGNAL_SEVERITIES = ["high", "medium", "low"] as const

const fail = (message: string): never => {
  throw new Error(`Qualitative analysis failed validation: ${message}`)
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v)

const requireString = (v: unknown, path: string): string => {
  if (typeof v !== "string" || v.trim() === "") fail(`${path} must be a non-empty string`)
  return v as string
}

const requireEnum = <T extends string>(v: unknown, allowed: readonly T[], path: string): T => {
  if (typeof v !== "string" || !(allowed as readonly string[]).includes(v)) {
    fail(`${path} must be one of ${allowed.join(", ")}`)
  }
  return v as T
}

const requireCount = (v: unknown, path: string): number => {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) {
    fail(`${path} must be a non-negative number`)
  }
  return Math.round(v as number)
}

export const parseQualitativeAnalysis = (value: unknown): QualitativeAnalysis => {
  if (!isRecord(value)) fail("root must be an object")
  const root = value as Record<string, unknown>

  if (!Array.isArray(root.esma_flags)) fail("esma_flags must be an array")
  const esma_flags = (root.esma_flags as unknown[]).map((item, i) => {
    if (!isRecord(item)) fail(`esma_flags[${i}] must be an object`)
    const flag = item as Record<string, unknown>
    return {
      code: requireString(flag.code, `esma_flags[${i}].code`),
      severity: requireEnum(flag.severity, FLAG_SEVERITIES, `esma_flags[${i}].severity`),
      message: requireString(flag.message, `esma_flags[${i}].message`),
      affected_rows: requireCount(flag.affected_rows, `esma_flags[${i}].affected_rows`)
    }
  })

  if (!Array.isArray(root.risk_signals)) fail("risk_signals must be an array")
  const risk_signals = (root.risk_signals as unknown[]).map((item, i) => {
    if (!isRecord(item)) fail(`risk_signals[${i}] must be an object`)
    const signal = item as Record<string, unknown>
    return {
      type: requireString(signal.type, `risk_signals[${i}].type`),
      severity: requireEnum(signal.severity, SIGNAL_SEVERITIES, `risk_signals[${i}].severity`),
      description: requireString(signal.description, `risk_signals[${i}].description`),
      recommendation: requireString(signal.recommendation, `risk_signals[${i}].recommendation`)
    }
  })

  const executive_summary = requireString(root.executive_summary, "executive_summary")

  return { esma_flags, risk_signals, executive_summary }
}

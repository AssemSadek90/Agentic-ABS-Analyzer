import { sql } from "./client"
import type { PoolMetrics } from "../metrics/compute"
import type { ProviderId, QualitativeAnalysis } from "../ai/provider"
import type { RowValidationError } from "../pipeline/schema"
import type {
  RunStatus,
  ValidationErrorDTO,
  HistoryItem,
  AnalyzeResponse,
  AnalysisDTO,
  BreakdownDTO,
  RiskSignalDTO,
  RuleResultDTO,
  ChatConversationDTO,
  ChatMessageDTO
} from "../types"

// Flatten the per-row validation errors into one record per individual error,
// mapping the Effect-TS error tags to the DB's error_type vocabulary
// ('missing' | 'invalid_type' | 'constraint_violation' | 'duplicate'). This is
// the shape stored in validation_errors and returned in the API response.
export const flattenValidationErrors = (errors: RowValidationError[]): ValidationErrorDTO[] => {
  const out: ValidationErrorDTO[] = []
  for (const row of errors) {
    for (const e of row.errors) {
      switch (e._tag) {
        case "MissingField":
          out.push({
            rowNumber: row.rowNumber,
            assetId: row.assetId,
            field: e.field,
            errorType: "missing",
            message: `Missing required field '${e.field}'`
          })
          break
        case "InvalidType":
          out.push({
            rowNumber: row.rowNumber,
            assetId: row.assetId,
            field: e.field,
            errorType: "invalid_type",
            message: `Invalid value for '${e.field}': "${e.rawValue}" is not a valid ${e.expectedType}`
          })
          break
        case "ConstraintViolation":
          out.push({
            rowNumber: row.rowNumber,
            assetId: row.assetId,
            field: e.field,
            errorType: "constraint_violation",
            message: e.message
          })
          break
        case "DuplicateId":
          out.push({
            rowNumber: row.rowNumber,
            assetId: row.assetId,
            field: "asset_id",
            errorType: "duplicate",
            message: `Duplicate asset_id '${e.assetId}' (first occurrence kept; this row skipped)`
          })
          break
      }
    }
  }
  return out
}

export interface PersistInput {
  userId: string
  filename: string | null
  rowCount: number
  validRowCount: number
  status: RunStatus
  rawCsv: string
  flatErrors: ValidationErrorDTO[]
  // null for failed runs (no metrics computed, no AI call made)
  metrics: PoolMetrics | null
  analysis: QualitativeAnalysis | null
  rawAi: unknown
  // which LLM produced the qualitative layer (null on failed runs)
  provider: string | null
  model: string | null
  // deterministic compliance checks (empty for failed runs)
  ruleResults: RuleResultDTO[]
}

export interface PersistedRun {
  id: string
  createdAt: string // ISO timestamp
}

// postgres.js's JSONValue type has no implicit index signature, so interface-
// typed records (Breakdown maps, flag arrays) fail to type-check even though
// they are plain JSON-serializable data. Narrowing through this helper is safe.
const asJson = (value: unknown) => value as Parameters<typeof sql.json>[0]

// Insert analysis_runs + validation_errors (+ analysis_results when present) in
// a single transaction so a run is never persisted half-written.
export const persistAnalysisRun = async (input: PersistInput): Promise<PersistedRun> => {
  const result = await sql.begin(async (tx) => {
    const [run] = await tx<{ id: string; created_at: Date }[]>`
      INSERT INTO analysis_runs (user_id, filename, row_count, valid_row_count, status, raw_csv)
      VALUES (
        ${input.userId},
        ${input.filename},
        ${input.rowCount},
        ${input.validRowCount},
        ${input.status},
        ${input.rawCsv}
      )
      RETURNING id, created_at
    `
    const runId = run.id

    if (input.flatErrors.length > 0) {
      await tx`
        INSERT INTO validation_errors ${tx(
          input.flatErrors.map((e) => ({
            run_id: runId,
            row_number: e.rowNumber,
            asset_id: e.assetId,
            field: e.field,
            error_type: e.errorType,
            message: e.message
          })),
          "run_id",
          "row_number",
          "asset_id",
          "field",
          "error_type",
          "message"
        )}
      `
    }

    if (input.metrics && input.analysis) {
      await tx`
        INSERT INTO analysis_results (
          run_id,
          provider,
          model,
          total_pool_volume,
          weighted_avg_rate,
          weighted_avg_ltv,
          avg_remaining_tenor,
          delinquency_rate,
          concentration_top5,
          obligor_top1,
          obligor_top5,
          asset_type_breakdown,
          country_breakdown,
          esma_flags,
          risk_signals,
          executive_summary,
          raw_ai_response
        ) VALUES (
          ${runId},
          ${input.provider},
          ${input.model},
          ${input.metrics.totalPoolVolume},
          ${input.metrics.weightedAvgRate},
          ${input.metrics.weightedAvgLtv},
          ${input.metrics.avgRemainingTenor},
          ${input.metrics.delinquencyRate},
          ${input.metrics.concentrationTop5},
          ${input.metrics.obligorTop1},
          ${input.metrics.obligorTop5},
          ${tx.json(asJson(input.metrics.assetTypeBreakdown))},
          ${tx.json(asJson(input.metrics.countryBreakdown))},
          ${tx.json(asJson(input.analysis.esma_flags))},
          ${tx.json(asJson(input.analysis.risk_signals))},
          ${input.analysis.executive_summary},
          ${tx.json(asJson(input.rawAi))}
        )
      `
    }

    if (input.ruleResults.length > 0) {
      await tx`
        INSERT INTO rule_results ${tx(
          input.ruleResults.map((r) => ({
            run_id: runId,
            rule_code: r.ruleCode,
            severity: r.severity,
            passed: r.passed,
            observed_value: r.observedValue,
            threshold_value: r.thresholdValue,
            message: r.message
          })),
          "run_id",
          "rule_code",
          "severity",
          "passed",
          "observed_value",
          "threshold_value",
          "message"
        )}
      `
    }

    return { id: runId, createdAt: run.created_at.toISOString() }
  })

  return result as PersistedRun
}

// ── Read side (history endpoints) ───────────────────────────────────────────
//
// NOTE: postgres.js returns NUMERIC columns as strings, so every rate/volume read
// back from the DB is coerced with Number(...) before it goes out as JSON. JSONB
// columns (breakdowns, flags, signals) come back already parsed into JS objects.

interface HistoryRow {
  id: string
  created_at: Date
  filename: string | null
  row_count: number
  valid_row_count: number
  status: RunStatus
  total_pool_volume: string | null
  esma_flag_count: number | null
  risk_signal_count: number | null
  model: string | null
}

// Paginated list of the user's past runs, newest first, with joined summary fields.
export const getHistory = async (
  userId: string,
  page: number,
  limit: number
): Promise<{ runs: HistoryItem[]; total: number }> => {
  const offset = (page - 1) * limit

  const rows = await sql<HistoryRow[]>`
    SELECT
      r.id,
      r.created_at,
      r.filename,
      r.row_count,
      r.valid_row_count,
      r.status,
      ar.total_pool_volume,
      ar.model,
      CASE WHEN ar.esma_flags IS NULL THEN NULL ELSE jsonb_array_length(ar.esma_flags) END AS esma_flag_count,
      CASE WHEN ar.risk_signals IS NULL THEN NULL ELSE jsonb_array_length(ar.risk_signals) END AS risk_signal_count
    FROM analysis_runs r
    LEFT JOIN analysis_results ar ON ar.run_id = r.id
    WHERE r.user_id = ${userId}
    ORDER BY r.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `

  const [{ total }] = await sql<{ total: number }[]>`
    SELECT count(*)::int AS total FROM analysis_runs WHERE user_id = ${userId}
  `

  const runs: HistoryItem[] = rows.map((row) => ({
    id: row.id,
    createdAt: row.created_at.toISOString(),
    filename: row.filename,
    rowCount: row.row_count,
    validRowCount: row.valid_row_count,
    status: row.status,
    totalPoolVolume: row.total_pool_volume === null ? null : Number(row.total_pool_volume),
    esmaFlagCount: row.esma_flag_count,
    riskSignalCount: row.risk_signal_count,
    model: row.model
  }))

  return { runs, total }
}

interface RunRow {
  id: string
  created_at: Date
  filename: string | null
  row_count: number
  valid_row_count: number
  status: RunStatus
}

interface ValidationErrorRow {
  row_number: number
  asset_id: string | null
  field: string
  error_type: string
  message: string
}

interface AnalysisResultRow {
  provider: string | null
  model: string | null
  total_pool_volume: string
  weighted_avg_rate: string
  weighted_avg_ltv: string | null
  avg_remaining_tenor: string
  delinquency_rate: string
  concentration_top5: string
  obligor_top1: string | null
  obligor_top5: string | null
  asset_type_breakdown: Record<string, BreakdownDTO>
  country_breakdown: Record<string, BreakdownDTO>
  esma_flags: Array<{ code: string; severity: "error" | "warning" | "info"; message: string; affected_rows: number }>
  risk_signals: RiskSignalDTO[]
  executive_summary: string
}

// Reconstruct a single run into the §4.2 response shape. Ownership-scoped:
// a run that exists but belongs to another user also returns null (→ 404, §S.3).
export const getRunById = async (id: string, userId: string): Promise<AnalyzeResponse | null> => {
  const [run] = await sql<RunRow[]>`
    SELECT id, created_at, filename, row_count, valid_row_count, status
    FROM analysis_runs
    WHERE id = ${id} AND user_id = ${userId}
  `
  if (!run) return null

  const errorRows = await sql<ValidationErrorRow[]>`
    SELECT row_number, asset_id, field, error_type, message
    FROM validation_errors
    WHERE run_id = ${id}
    ORDER BY row_number
  `
  const validationErrors: ValidationErrorDTO[] = errorRows.map((e) => ({
    rowNumber: e.row_number,
    assetId: e.asset_id,
    field: e.field,
    errorType: e.error_type,
    message: e.message
  }))

  const [resultRow] = await sql<AnalysisResultRow[]>`
    SELECT
      provider, model,
      total_pool_volume, weighted_avg_rate, weighted_avg_ltv, avg_remaining_tenor,
      delinquency_rate, concentration_top5, obligor_top1, obligor_top5,
      asset_type_breakdown, country_breakdown,
      esma_flags, risk_signals, executive_summary
    FROM analysis_results
    WHERE run_id = ${id}
  `

  const ruleRows = await sql<
    {
      rule_code: string
      severity: "error" | "warning" | "info"
      passed: boolean
      observed_value: string | null
      threshold_value: string | null
      message: string
    }[]
  >`
    SELECT rule_code, severity, passed, observed_value, threshold_value, message
    FROM rule_results
    WHERE run_id = ${id}
    ORDER BY rule_code
  `
  const ruleResults: RuleResultDTO[] = ruleRows.map((r) => ({
    ruleCode: r.rule_code,
    severity: r.severity,
    passed: r.passed,
    observedValue: r.observed_value === null ? null : Number(r.observed_value),
    thresholdValue: r.threshold_value === null ? null : Number(r.threshold_value),
    message: r.message
  }))

  const analysis: AnalysisDTO | null = resultRow
    ? {
        provider: resultRow.provider,
        model: resultRow.model,
        totalPoolVolume: Number(resultRow.total_pool_volume),
        weightedAvgRate: Number(resultRow.weighted_avg_rate),
        weightedAvgLtv: resultRow.weighted_avg_ltv === null ? null : Number(resultRow.weighted_avg_ltv),
        avgRemainingTenor: Number(resultRow.avg_remaining_tenor),
        delinquencyRate: Number(resultRow.delinquency_rate),
        concentrationTop5: Number(resultRow.concentration_top5),
        obligorTop1: resultRow.obligor_top1 === null ? null : Number(resultRow.obligor_top1),
        obligorTop5: resultRow.obligor_top5 === null ? null : Number(resultRow.obligor_top5),
        assetTypeBreakdown: resultRow.asset_type_breakdown,
        countryBreakdown: resultRow.country_breakdown,
        esmaFlags: resultRow.esma_flags.map((f) => ({
          code: f.code,
          severity: f.severity,
          message: f.message,
          affectedRows: f.affected_rows
        })),
        riskSignals: resultRow.risk_signals,
        executiveSummary: resultRow.executive_summary
      }
    : null

  return {
    run: {
      id: run.id,
      createdAt: run.created_at.toISOString(),
      filename: run.filename,
      rowCount: run.row_count,
      validRowCount: run.valid_row_count,
      status: run.status
    },
    validationErrors,
    ruleResults,
    analysis
  }
}

// ── Provider keys (BYOK vault, §S.3) ────────────────────────────────────────
// Write-only from the API's perspective: the encrypted key never leaves this
// module except to the selection resolver, which decrypts in-memory at call time.

export interface ProviderKeyInfo {
  provider: string
  last4: string
  createdAt: string
}

export const listProviderKeys = async (userId: string): Promise<ProviderKeyInfo[]> => {
  const rows = await sql<{ provider: string; key_last4: string; created_at: Date }[]>`
    SELECT provider, key_last4, created_at
    FROM provider_keys
    WHERE user_id = ${userId}
    ORDER BY provider
  `
  return rows.map((r) => ({
    provider: r.provider,
    last4: r.key_last4,
    createdAt: r.created_at.toISOString()
  }))
}

export const getProviderKeyEncrypted = async (
  userId: string,
  provider: ProviderId
): Promise<string | null> => {
  const rows = await sql<{ encrypted_key: string }[]>`
    SELECT encrypted_key FROM provider_keys
    WHERE user_id = ${userId} AND provider = ${provider}
  `
  return rows[0]?.encrypted_key ?? null
}

export const upsertProviderKey = async (
  userId: string,
  provider: ProviderId,
  encryptedKey: string,
  last4: string
): Promise<void> => {
  await sql`
    INSERT INTO provider_keys (user_id, provider, encrypted_key, key_last4)
    VALUES (${userId}, ${provider}, ${encryptedKey}, ${last4})
    ON CONFLICT (user_id, provider)
    DO UPDATE SET
      encrypted_key = EXCLUDED.encrypted_key,
      key_last4 = EXCLUDED.key_last4,
      updated_at = NOW()
  `
}

export const deleteProviderKey = async (userId: string, provider: ProviderId): Promise<void> => {
  await sql`DELETE FROM provider_keys WHERE user_id = ${userId} AND provider = ${provider}`
}

// ── Chat (§S.5) ─────────────────────────────────────────────────────────────

interface ConversationRow {
  id: string
  title: string
  attached_run_id: string | null
  created_at: Date
  updated_at: Date
}

const toConversationDTO = (row: ConversationRow): ChatConversationDTO => ({
  id: row.id,
  title: row.title,
  attachedRunId: row.attached_run_id,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString()
})

export const createConversation = async (
  userId: string,
  title: string | null,
  attachedRunId: string | null
): Promise<ChatConversationDTO> => {
  const [row] = await sql<ConversationRow[]>`
    INSERT INTO chat_conversations (user_id, title, attached_run_id)
    VALUES (${userId}, ${title ?? "New conversation"}, ${attachedRunId})
    RETURNING id, title, attached_run_id, created_at, updated_at
  `
  return toConversationDTO(row)
}

export const listConversations = async (userId: string): Promise<ChatConversationDTO[]> => {
  const rows = await sql<ConversationRow[]>`
    SELECT id, title, attached_run_id, created_at, updated_at
    FROM chat_conversations
    WHERE user_id = ${userId}
    ORDER BY updated_at DESC
    LIMIT 100
  `
  return rows.map(toConversationDTO)
}

// Ownership-scoped: someone else's conversation reads as missing (→ 404, §S.3).
export const getConversation = async (
  id: string,
  userId: string
): Promise<ChatConversationDTO | null> => {
  const [row] = await sql<ConversationRow[]>`
    SELECT id, title, attached_run_id, created_at, updated_at
    FROM chat_conversations
    WHERE id = ${id} AND user_id = ${userId}
  `
  return row ? toConversationDTO(row) : null
}

export const deleteConversation = async (id: string, userId: string): Promise<boolean> => {
  const result = await sql`
    DELETE FROM chat_conversations WHERE id = ${id} AND user_id = ${userId}
  `
  return result.count > 0
}

export const updateConversationAttachedRun = async (
  id: string,
  attachedRunId: string | null
): Promise<void> => {
  await sql`
    UPDATE chat_conversations
    SET attached_run_id = ${attachedRunId}, updated_at = NOW()
    WHERE id = ${id}
  `
}

export const updateConversationTitle = async (id: string, title: string): Promise<void> => {
  await sql`UPDATE chat_conversations SET title = ${title} WHERE id = ${id}`
}

export const touchConversation = async (id: string): Promise<void> => {
  await sql`UPDATE chat_conversations SET updated_at = NOW() WHERE id = ${id}`
}

interface MessageRow {
  id: string
  role: "user" | "assistant"
  content: string
  attached_run_id: string | null
  created_at: Date
}

const toMessageDTO = (row: MessageRow): ChatMessageDTO => ({
  id: row.id,
  role: row.role,
  content: row.content,
  attachedRunId: row.attached_run_id,
  createdAt: row.created_at.toISOString()
})

export const getConversationMessages = async (conversationId: string): Promise<ChatMessageDTO[]> => {
  const rows = await sql<MessageRow[]>`
    SELECT id, role, content, attached_run_id, created_at
    FROM chat_messages
    WHERE conversation_id = ${conversationId}
    ORDER BY created_at ASC
  `
  return rows.map(toMessageDTO)
}

// The most recent `limit` messages, in chronological order (§S.5 context window).
export const getRecentMessages = async (
  conversationId: string,
  limit: number
): Promise<ChatMessageDTO[]> => {
  const rows = await sql<MessageRow[]>`
    SELECT id, role, content, attached_run_id, created_at
    FROM chat_messages
    WHERE conversation_id = ${conversationId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `
  return rows.reverse().map(toMessageDTO)
}

export const insertChatMessage = async (
  conversationId: string,
  role: "user" | "assistant",
  content: string,
  attachedRunId: string | null
): Promise<{ id: string; createdAt: string }> => {
  const [row] = await sql<{ id: string; created_at: Date }[]>`
    INSERT INTO chat_messages (conversation_id, role, content, attached_run_id)
    VALUES (${conversationId}, ${role}, ${content}, ${attachedRunId})
    RETURNING id, created_at
  `
  return { id: row.id, createdAt: row.created_at.toISOString() }
}

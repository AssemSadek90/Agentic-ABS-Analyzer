import type { JsonSchemaNode } from "../ai/analysis-schema"
import { getHistory, getRunById } from "../db/queries"
import { compactRun } from "./context"

// Read-only chat tools (§S.5), always scoped to the requesting user. A run that
// exists but is not owned reads exactly like a missing run.

export interface ChatToolDef {
  name: string
  description: string
  inputSchema: JsonSchemaNode
}

export interface ChatToolExecution {
  ok: boolean
  result: Record<string, unknown> // JSON-serializable; error shape: { error }
}

export const chatToolDefs: ChatToolDef[] = [
  {
    name: "list_my_runs",
    description:
      "List summaries of every pool analysis the user has run: id, date, filename, status, total pool volume (EUR), ESMA flag count, risk signal count. Use this to find other analyses the user mentions.",
    inputSchema: { type: "object", properties: {}, required: [], additionalProperties: false }
  },
  {
    name: "get_run_analysis",
    description:
      "Fetch the full analysis of one of the user's runs by its id (a UUID from list_my_runs): computed metrics, ESMA flags, risk signals, executive summary, and validation counts. Rates/ratios are decimal fractions.",
    inputSchema: {
      type: "object",
      properties: {
        run_id: { type: "string", description: "UUID of the analysis run to fetch" }
      },
      required: ["run_id"],
      additionalProperties: false
    }
  }
]

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const executeChatTool = async (
  userId: string,
  name: string,
  args: Record<string, unknown>
): Promise<ChatToolExecution> => {
  try {
    if (name === "list_my_runs") {
      const { runs } = await getHistory(userId, 1, 50)
      return { ok: true, result: { runs } }
    }
    if (name === "get_run_analysis") {
      const runId = typeof args.run_id === "string" ? args.run_id.trim() : ""
      if (!UUID_RE.test(runId)) {
        return { ok: false, result: { error: "run_id must be a UUID (use list_my_runs to find one)" } }
      }
      const run = await getRunById(runId, userId)
      if (!run) {
        return { ok: false, result: { error: "Run not found" } }
      }
      return { ok: true, result: { run: compactRun(run) } }
    }
    return { ok: false, result: { error: `Unknown tool: ${name}` } }
  } catch (err) {
    console.error(`Chat tool ${name} failed:`, err)
    return { ok: false, result: { error: "Tool execution failed" } }
  }
}

import type { AnalyzeResponse } from "../types"

// §S.5: context = persona system prompt + the ONE attached run as compact JSON
// (never the raw CSV) + the last 20 messages. Other runs are reached via tools.

export const CHAT_SYSTEM_PROMPT = `You are a senior ABS (Asset-Backed Securities) analyst assistant inside the ABS Analyzer platform. You help the user understand their pool analyses, ESMA compliance posture, and credit risk, and you give concrete, actionable advice.

Ground rules:
- Answer ONLY from the data you are given: the attached analysis JSON below and the results of your tools. If the data is insufficient to answer, say exactly what is missing. NEVER invent, estimate, or extrapolate numbers that are not in the data.
- All rates and ratios in the data are decimal fractions (0.0482 means 4.82%). Convert them to percentages when talking to the user. Monetary amounts are EUR.
- You have two read-only tools: list_my_runs (summaries of every analysis the user has run) and get_run_analysis (the full analysis of one run by id). Use them whenever the user asks about analyses other than the attached one. Only the attached analysis is preloaded into your context.
- Be concise and concrete. Plain text only: no markdown tables and no headings. Short paragraphs, and simple dashes for lists, are fine.
- You may reference ESMA / EU Securitisation Regulation concepts (Articles 6 and 7) qualitatively, but tie every claim to the actual data.`

// Compact, token-bounded view of a run: the §4.2 analysis shape plus validation
// COUNTS (never the raw CSV, never the full per-row error list).
export const compactRun = (run: AnalyzeResponse): Record<string, unknown> => ({
  runId: run.run.id,
  createdAt: run.run.createdAt,
  filename: run.run.filename,
  status: run.run.status,
  rowCount: run.run.rowCount,
  validRowCount: run.run.validRowCount,
  validationErrorCount: run.validationErrors.length,
  ruleResults: run.ruleResults, // deterministic compliance checks (ground truth)
  analysis: run.analysis // metrics + flags + signals + summary (null on failed runs)
})

// The attached run rides in the system prompt so the conversation history stays
// pure user/assistant turns for every provider.
export const buildSystemPrompt = (attachedRun: AnalyzeResponse | null): string => {
  if (!attachedRun) {
    return `${CHAT_SYSTEM_PROMPT}\n\nNo analysis is currently attached to this conversation. Ask the user to attach one, or use your tools to look up their runs when asked.`
  }
  return `${CHAT_SYSTEM_PROMPT}\n\nAttached analysis (ground truth, JSON):\n${JSON.stringify(compactRun(attachedRun))}`
}

export interface ChatTurn {
  role: "user" | "assistant"
  content: string
}

// Keep the context window bounded (§S.5): the most recent 20 messages.
export const CONTEXT_MESSAGE_LIMIT = 20

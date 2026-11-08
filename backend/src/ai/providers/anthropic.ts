import Anthropic from "@anthropic-ai/sdk"
import { analysisTools } from "../tools"
import { SYSTEM_PROMPT, buildUserMessage } from "../prompt"
import { pickSample } from "../sample"
import { parseQualitativeAnalysis } from "../validate-analysis"
import { ProviderAuthError, type QualitativeProvider } from "../provider"

export const isAnthropicAuthError = (err: unknown): boolean =>
  err instanceof Anthropic.APIError && (err.status === 401 || err.status === 403)
const isAuthError = isAnthropicAuthError

// Faithful port of the MVP ai/analyze.ts logic behind the provider interface;
// the client is constructed per request from the resolved API key.
//
// Works across Claude generations because the model list is dynamic:
// - tool_choice "auto" + a strict tool + the system prompt's instruction to
//   call it. Forced tool_choice ("tool"/"any") is a 400 on Opus 5.5, Sonnet
//   5.5 and Fable 5.1; a missing tool call still throws (and is retried once).
// - max_tokens leaves room for thinking, which is on by default on newer models.
const MAX_ANALYSIS_TOKENS = 16_000
export const anthropicProvider: QualitativeProvider = {
  id: "anthropic",
  async runQualitativeAnalysis({ metrics, validRows, validationSummary, ruleResults, model, apiKey }) {
    const client = new Anthropic({ apiKey })
    const sample = pickSample(validRows)

    let response: Anthropic.Message
    try {
      response = await client.messages.create({
        model,
        max_tokens: MAX_ANALYSIS_TOKENS,
        system: SYSTEM_PROMPT,
        tools: analysisTools,
        tool_choice: { type: "auto" },
        messages: [
          {
            role: "user",
            content: buildUserMessage(metrics, sample, validRows.length, validationSummary, ruleResults)
          }
        ]
      })
    } catch (err) {
      if (isAuthError(err)) throw new ProviderAuthError("anthropic")
      throw err
    }

    const toolUse = response.content.find((b) => b.type === "tool_use")
    if (!toolUse || toolUse.type !== "tool_use") {
      throw new Error("Claude did not call submit_pool_analysis")
    }

    return {
      analysis: parseQualitativeAnalysis(toolUse.input),
      raw: response,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens
      }
    }
  }
}

// Minimal live call used by PUT /api/keys to verify a key before storing it.
export const validateAnthropicKey = async (apiKey: string): Promise<boolean> => {
  const client = new Anthropic({ apiKey })
  try {
    await client.models.list({ limit: 1 })
    return true
  } catch (err) {
    if (isAuthError(err)) return false
    throw err // network/5xx: caller reports "could not validate", not "invalid"
  }
}

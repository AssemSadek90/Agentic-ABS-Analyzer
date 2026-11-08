import OpenAI from "openai"
import { SYSTEM_PROMPT, buildUserMessage } from "../prompt"
import { pickSample } from "../sample"
import { parseQualitativeAnalysis } from "../validate-analysis"
import { ANALYSIS_SCHEMA_NAME, qualitativeAnalysisJsonSchema } from "../analysis-schema"
import { ProviderAuthError, type QualitativeProvider } from "../provider"

export const isOpenAIAuthError = (err: unknown): boolean =>
  err instanceof OpenAI.APIError && (err.status === 401 || err.status === 403)
const isAuthError = isOpenAIAuthError

// Same prompt content as the Anthropic adapter (§S.4 constraint); only the
// transport differs: OpenAI enforces the contract via a strict json_schema
// response_format instead of a forced tool call.
export const openaiProvider: QualitativeProvider = {
  id: "openai",
  async runQualitativeAnalysis({ metrics, validRows, validationSummary, ruleResults, model, apiKey }) {
    const client = new OpenAI({ apiKey })
    const sample = pickSample(validRows)

    let completion: OpenAI.Chat.Completions.ChatCompletion
    try {
      completion = await client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: buildUserMessage(metrics, sample, validRows.length, validationSummary, ruleResults)
          }
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: ANALYSIS_SCHEMA_NAME,
            strict: true,
            schema: qualitativeAnalysisJsonSchema as unknown as Record<string, unknown>
          }
        }
      })
    } catch (err) {
      if (isAuthError(err)) throw new ProviderAuthError("openai")
      throw err
    }

    const message = completion.choices[0]?.message
    if (!message) {
      throw new Error("OpenAI returned no choices")
    }
    if (message.refusal) {
      throw new Error(`OpenAI refused the request: ${message.refusal}`)
    }
    if (!message.content) {
      throw new Error("OpenAI returned an empty response")
    }

    return {
      analysis: parseQualitativeAnalysis(JSON.parse(message.content)),
      raw: completion,
      usage: {
        inputTokens: completion.usage?.prompt_tokens ?? 0,
        outputTokens: completion.usage?.completion_tokens ?? 0
      }
    }
  }
}

// Minimal live call used by PUT /api/keys to verify a key before storing it.
export const validateOpenAIKey = async (apiKey: string): Promise<boolean> => {
  const client = new OpenAI({ apiKey, maxRetries: 1 })
  try {
    await client.models.list()
    return true
  } catch (err) {
    if (isAuthError(err)) return false
    throw err // network/5xx: caller reports "could not validate", not "invalid"
  }
}

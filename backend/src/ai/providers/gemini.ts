import { ApiError, GoogleGenAI, Type, type Schema } from "@google/genai"
import { SYSTEM_PROMPT, buildUserMessage } from "../prompt"
import { pickSample } from "../sample"
import { parseQualitativeAnalysis } from "../validate-analysis"
import { qualitativeAnalysisJsonSchema, type JsonSchemaNode } from "../analysis-schema"
import { ProviderAuthError, type QualitativeProvider } from "../provider"

// Gemini reports an invalid API key as 400 ("API key not valid") rather than
// a clean 401, so match on the message for that case too.
export const isGeminiAuthError = (err: unknown): boolean => {
  if (!(err instanceof ApiError)) return false
  if (err.status === 401 || err.status === 403) return true
  return err.status === 400 && /api key not valid|api_key_invalid/i.test(err.message)
}
const isAuthError = isGeminiAuthError

// Convert the canonical JSON Schema to Gemini's responseSchema dialect
// (uppercase Type enums, no additionalProperties). Structure, enums, and
// descriptions carry over 1:1, so the contract stays identical.
const TYPE_MAP: Record<JsonSchemaNode["type"], Type> = {
  object: Type.OBJECT,
  array: Type.ARRAY,
  string: Type.STRING,
  integer: Type.INTEGER,
  number: Type.NUMBER,
  boolean: Type.BOOLEAN
}

export const toGeminiSchema = (node: JsonSchemaNode): Schema => {
  const out: Schema = { type: TYPE_MAP[node.type] }
  if (node.description) out.description = node.description
  if (node.enum) out.enum = [...node.enum]
  if (node.required) out.required = [...node.required]
  if (node.items) out.items = toGeminiSchema(node.items)
  if (node.properties) {
    out.properties = Object.fromEntries(
      Object.entries(node.properties).map(([key, child]) => [key, toGeminiSchema(child)])
    )
  }
  return out
}

const RESPONSE_SCHEMA = toGeminiSchema(qualitativeAnalysisJsonSchema)

// Same prompt content as the other adapters (§S.4 constraint); the contract is
// enforced via responseMimeType + responseSchema JSON mode.
export const geminiProvider: QualitativeProvider = {
  id: "gemini",
  async runQualitativeAnalysis({ metrics, validRows, validationSummary, ruleResults, model, apiKey }) {
    const ai = new GoogleGenAI({ apiKey })
    const sample = pickSample(validRows)

    let response
    try {
      response = await ai.models.generateContent({
        model,
        contents: buildUserMessage(metrics, sample, validRows.length, validationSummary, ruleResults),
        config: {
          systemInstruction: SYSTEM_PROMPT,
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA
        }
      })
    } catch (err) {
      if (isAuthError(err)) throw new ProviderAuthError("gemini")
      throw err
    }

    const text = response.text
    if (!text) {
      throw new Error("Gemini returned an empty response")
    }

    return {
      analysis: parseQualitativeAnalysis(JSON.parse(text)),
      raw: response,
      usage: {
        inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0
      }
    }
  }
}

// Minimal live call used by PUT /api/keys to verify a key before storing it.
export const validateGeminiKey = async (apiKey: string): Promise<boolean> => {
  const ai = new GoogleGenAI({ apiKey })
  try {
    await ai.models.list()
    return true
  } catch (err) {
    if (isAuthError(err)) return false
    throw err // network/5xx: caller reports "could not validate", not "invalid"
  }
}

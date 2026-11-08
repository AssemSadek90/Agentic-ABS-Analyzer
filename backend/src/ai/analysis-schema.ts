// Canonical JSON Schema for the qualitative-analysis contract, shared by every
// provider adapter: Anthropic consumes it as a forced tool's input_schema,
// OpenAI as a strict response_format json_schema, Gemini converted to its
// responseSchema dialect. One source of truth keeps the three transports honest.

export const ANALYSIS_SCHEMA_NAME = "submit_pool_analysis"

export interface JsonSchemaNode {
  type: "object" | "array" | "string" | "integer" | "number" | "boolean"
  description?: string
  enum?: string[]
  properties?: Record<string, JsonSchemaNode>
  required?: string[]
  items?: JsonSchemaNode
  additionalProperties?: false
}

export const qualitativeAnalysisJsonSchema: JsonSchemaNode = {
  type: "object",
  properties: {
    esma_flags: {
      type: "array",
      description: "ESMA Article 7 ABS disclosure compliance issues found in the pool data.",
      items: {
        type: "object",
        properties: {
          code: {
            type: "string",
            description:
              "App-internal reference code (NOT an official ESMA identifier), e.g. ESMA-FIELD-MISSING, ESMA-CONCENTRATION, ESMA-DELINQUENCY"
          },
          severity: {
            type: "string",
            enum: ["error", "warning", "info"]
          },
          message: {
            type: "string",
            description: "Human-readable description of the issue"
          },
          affected_rows: {
            type: "integer",
            description: "Number of asset rows affected by this issue"
          }
        },
        required: ["code", "severity", "message", "affected_rows"],
        additionalProperties: false
      }
    },
    risk_signals: {
      type: "array",
      description: "Risk signals identified in the pool, with actionable recommendations.",
      items: {
        type: "object",
        properties: {
          type: {
            type: "string",
            description:
              "e.g. concentration_risk, high_delinquency, maturity_mismatch, geographic_concentration"
          },
          severity: {
            type: "string",
            enum: ["high", "medium", "low"]
          },
          description: {
            type: "string",
            description: "Specific, factual description of the risk signal observed in this data"
          },
          recommendation: {
            type: "string",
            description: "Concrete action to address this risk"
          }
        },
        required: ["type", "severity", "description", "recommendation"],
        additionalProperties: false
      }
    },
    executive_summary: {
      type: "string",
      description:
        "3-5 sentence plain-language summary of the pool's health, key characteristics, and the most important findings. Written for a financial professional. No markdown formatting."
    }
  },
  required: ["esma_flags", "risk_signals", "executive_summary"],
  additionalProperties: false
}

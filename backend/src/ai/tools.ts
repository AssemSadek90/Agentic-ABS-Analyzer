import Anthropic from "@anthropic-ai/sdk"
import { ANALYSIS_SCHEMA_NAME, qualitativeAnalysisJsonSchema } from "./analysis-schema"

// `strict: true` makes the API guarantee the tool input matches the schema.
// It replaces forcing the call with tool_choice, which newer Claude models
// (Opus 5.5, Sonnet 5.5, Fable 5.1) reject with a 400. The installed SDK
// predates the field, hence the cast.
export const analysisTools: Anthropic.Tool[] = [
  {
    strict: true,
    name: ANALYSIS_SCHEMA_NAME,
    description: `Submit the qualitative analysis of an ABS asset pool.
    Call this tool exactly once. The quantitative metrics have ALREADY been computed
    and are provided to you as input — do NOT recompute or restate them as numbers here.
    Your job is to interpret them: flag ESMA disclosure issues, surface risk signals
    with concrete recommendations, and write a short executive summary.`,
    // The canonical contract schema (shared with the OpenAI/Gemini adapters).
    input_schema: qualitativeAnalysisJsonSchema as unknown as Anthropic.Tool.InputSchema
  } as Anthropic.Tool
]

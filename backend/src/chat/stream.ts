import Anthropic from "@anthropic-ai/sdk"
import OpenAI from "openai"
import { GoogleGenAI, type Content, type FunctionDeclaration, type Part } from "@google/genai"

import { ProviderAuthError, type ProviderId } from "../ai/provider"
import { isAnthropicAuthError } from "../ai/providers/anthropic"
import { isOpenAIAuthError } from "../ai/providers/openai"
import { isGeminiAuthError, toGeminiSchema } from "../ai/providers/gemini"
import type { ChatTurn } from "./context"
import type { ChatToolDef, ChatToolExecution } from "./tools"

// Provider-agnostic streaming chat with a tool loop (§S.5). All three
// implementations stream text deltas as they arrive and run tools between
// iterations, capped at MAX_TOOL_ITERATIONS. Prompt content (system + turns +
// tool definitions) is identical across providers; only transport differs.

export const MAX_TOOL_ITERATIONS = 5
// Room for thinking (on by default on newer models) plus the visible answer.
const MAX_CHAT_TOKENS = 16_000

export interface ChatStreamRequest {
  model: string
  apiKey: string
  system: string
  turns: ChatTurn[]
  tools: ChatToolDef[]
  executeTool: (name: string, args: Record<string, unknown>) => Promise<ChatToolExecution>
  onDelta: (text: string) => void
  onTool: (name: string) => void
}

export interface ChatStreamResult {
  text: string
  usage: { inputTokens: number; outputTokens: number }
}

const iterationLimitError = (): Error =>
  new Error(`Chat tool loop exceeded ${MAX_TOOL_ITERATIONS} iterations`)

// ── Anthropic: native streaming + tool_use loop ────────────────────────────

const runAnthropic = async (req: ChatStreamRequest): Promise<ChatStreamResult> => {
  const client = new Anthropic({ apiKey: req.apiKey })
  const tools: Anthropic.Tool[] = req.tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema as unknown as Anthropic.Tool.InputSchema
  }))
  const messages: Anthropic.MessageParam[] = req.turns.map((t) => ({
    role: t.role,
    content: t.content
  }))

  let text = ""
  const usage = { inputTokens: 0, outputTokens: 0 }

  for (let iteration = 0; ; iteration++) {
    const stream = client.messages.stream({
      model: req.model,
      max_tokens: MAX_CHAT_TOKENS,
      system: req.system,
      tools,
      messages
    })
    stream.on("text", (delta) => {
      text += delta
      req.onDelta(delta)
    })

    let final: Anthropic.Message
    try {
      final = await stream.finalMessage()
    } catch (err) {
      if (isAnthropicAuthError(err)) throw new ProviderAuthError("anthropic")
      throw err
    }
    usage.inputTokens += final.usage.input_tokens
    usage.outputTokens += final.usage.output_tokens

    if (final.stop_reason !== "tool_use") {
      return { text, usage }
    }
    if (iteration >= MAX_TOOL_ITERATIONS) throw iterationLimitError()

    const toolUses = final.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    )
    messages.push({ role: "assistant", content: final.content })
    const results: Anthropic.ToolResultBlockParam[] = []
    for (const toolUse of toolUses) {
      req.onTool(toolUse.name)
      const exec = await req.executeTool(toolUse.name, toolUse.input as Record<string, unknown>)
      results.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: JSON.stringify(exec.result),
        is_error: !exec.ok
      })
    }
    messages.push({ role: "user", content: results })
  }
}

// ── OpenAI: streamed chat.completions with accumulated tool_call deltas ─────

interface OpenAIToolCallAcc {
  id: string
  name: string
  args: string
}

const runOpenAI = async (req: ChatStreamRequest): Promise<ChatStreamResult> => {
  const client = new OpenAI({ apiKey: req.apiKey })
  const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = req.tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema as unknown as Record<string, unknown>
    }
  }))
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: req.system },
    ...req.turns.map((t) =>
      t.role === "user"
        ? ({ role: "user", content: t.content } as const)
        : ({ role: "assistant", content: t.content } as const)
    )
  ]

  let text = ""
  const usage = { inputTokens: 0, outputTokens: 0 }

  for (let iteration = 0; ; iteration++) {
    let stream
    try {
      stream = await client.chat.completions.create({
        model: req.model,
        messages,
        tools,
        stream: true,
        stream_options: { include_usage: true }
      })
    } catch (err) {
      if (isOpenAIAuthError(err)) throw new ProviderAuthError("openai")
      throw err
    }

    let content = ""
    const toolCalls: OpenAIToolCallAcc[] = []
    for await (const chunk of stream) {
      if (chunk.usage) {
        usage.inputTokens += chunk.usage.prompt_tokens
        usage.outputTokens += chunk.usage.completion_tokens
      }
      const delta = chunk.choices?.[0]?.delta
      if (!delta) continue
      if (delta.content) {
        content += delta.content
        text += delta.content
        req.onDelta(delta.content)
      }
      for (const tc of delta.tool_calls ?? []) {
        const slot = (toolCalls[tc.index] ??= { id: "", name: "", args: "" })
        if (tc.id) slot.id = tc.id
        if (tc.function?.name) slot.name += tc.function.name
        if (tc.function?.arguments) slot.args += tc.function.arguments
      }
    }

    if (toolCalls.length === 0) {
      return { text, usage }
    }
    if (iteration >= MAX_TOOL_ITERATIONS) throw iterationLimitError()

    messages.push({
      role: "assistant",
      content: content || null,
      tool_calls: toolCalls.map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: { name: tc.name, arguments: tc.args }
      }))
    })
    for (const tc of toolCalls) {
      req.onTool(tc.name)
      let args: Record<string, unknown> = {}
      try {
        args = tc.args ? (JSON.parse(tc.args) as Record<string, unknown>) : {}
      } catch {
        /* malformed args: run the tool with none; it will report the problem */
      }
      const exec = await req.executeTool(tc.name, args)
      messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(exec.result) })
    }
  }
}

// ── Gemini: generateContentStream with functionCall parts ───────────────────

const runGemini = async (req: ChatStreamRequest): Promise<ChatStreamResult> => {
  const ai = new GoogleGenAI({ apiKey: req.apiKey })
  const functionDeclarations: FunctionDeclaration[] = req.tools.map((t) => ({
    name: t.name,
    description: t.description,
    // Gemini rejects empty-object parameter schemas: omit for no-arg tools.
    ...(Object.keys(t.inputSchema.properties ?? {}).length > 0
      ? { parameters: toGeminiSchema(t.inputSchema) }
      : {})
  }))
  const contents: Content[] = req.turns.map((t) => ({
    role: t.role === "assistant" ? "model" : "user",
    parts: [{ text: t.content }]
  }))

  let text = ""
  const usage = { inputTokens: 0, outputTokens: 0 }

  for (let iteration = 0; ; iteration++) {
    let stream
    try {
      stream = await ai.models.generateContentStream({
        model: req.model,
        contents,
        config: {
          systemInstruction: req.system,
          tools: [{ functionDeclarations }]
        }
      })
    } catch (err) {
      if (isGeminiAuthError(err)) throw new ProviderAuthError("gemini")
      throw err
    }

    // Keep every part (thought parts carry signatures the next turn may need);
    // only surface non-thought text to the user.
    const modelParts: Part[] = []
    const calls: Array<{ name: string; args: Record<string, unknown> }> = []
    // usageMetadata is cumulative within one response: keep the last snapshot,
    // add it once per iteration.
    let iterationPrompt = 0
    let iterationCandidates = 0
    for await (const chunk of stream) {
      const parts = chunk.candidates?.[0]?.content?.parts ?? []
      for (const part of parts) {
        modelParts.push(part)
        if (part.text && !part.thought) {
          text += part.text
          req.onDelta(part.text)
        }
        if (part.functionCall?.name) {
          calls.push({
            name: part.functionCall.name,
            args: (part.functionCall.args ?? {}) as Record<string, unknown>
          })
        }
      }
      if (chunk.usageMetadata) {
        iterationPrompt = chunk.usageMetadata.promptTokenCount ?? iterationPrompt
        iterationCandidates = chunk.usageMetadata.candidatesTokenCount ?? iterationCandidates
      }
    }
    usage.inputTokens += iterationPrompt
    usage.outputTokens += iterationCandidates

    if (calls.length === 0) {
      return { text, usage }
    }
    if (iteration >= MAX_TOOL_ITERATIONS) throw iterationLimitError()

    contents.push({ role: "model", parts: modelParts })
    const responseParts: Part[] = []
    for (const call of calls) {
      req.onTool(call.name)
      const exec = await req.executeTool(call.name, call.args)
      responseParts.push({
        functionResponse: { name: call.name, response: exec.result }
      })
    }
    contents.push({ role: "user", parts: responseParts })
  }
}

// ── Dispatcher ───────────────────────────────────────────────────────────────

export const runChatStream = (
  provider: ProviderId,
  req: ChatStreamRequest
): Promise<ChatStreamResult> => {
  if (provider === "anthropic") return runAnthropic(req)
  if (provider === "openai") return runOpenAI(req)
  return runGemini(req)
}

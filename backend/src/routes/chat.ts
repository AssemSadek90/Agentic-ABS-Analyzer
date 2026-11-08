import { Router } from "express"
import type { Response } from "express"
import { ProviderAuthError } from "../ai/provider"
import { SelectionError, resolveSelection, type ResolvedSelection } from "../ai/selection"
import { buildSystemPrompt, CONTEXT_MESSAGE_LIMIT, type ChatTurn } from "../chat/context"
import { chatToolDefs, executeChatTool } from "../chat/tools"
import { runChatStream } from "../chat/stream"
import {
  createConversation,
  deleteConversation,
  getConversation,
  getConversationMessages,
  getRecentMessages,
  getRunById,
  insertChatMessage,
  listConversations,
  touchConversation,
  updateConversationAttachedRun,
  updateConversationTitle
} from "../db/queries"
import type { ChatDetailResponse } from "../types"

export const chatRouter = Router()

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_MESSAGE_CHARS = 8000
const DEFAULT_TITLE = "New conversation"

// POST /api/chat — create a conversation, optionally pre-attaching a run.
chatRouter.post("/chat", async (req, res) => {
  const userId = req.user!.id
  const body = (req.body ?? {}) as Record<string, unknown>

  let title: string | null = null
  if (body.title !== undefined) {
    if (typeof body.title !== "string" || body.title.trim() === "") {
      return res.status(400).json({ error: "title must be a non-empty string" })
    }
    title = body.title.trim().slice(0, 120)
  }

  let attachedRunId: string | null = null
  if (body.attachedRunId !== undefined && body.attachedRunId !== null) {
    if (typeof body.attachedRunId !== "string" || !UUID_RE.test(body.attachedRunId)) {
      return res.status(400).json({ error: "attachedRunId must be a UUID" })
    }
    try {
      const run = await getRunById(body.attachedRunId, userId)
      if (!run) return res.status(404).json({ error: "Run not found" })
    } catch (err) {
      console.error("Attachment check failed:", err)
      return res.status(500).json({ error: "Internal Server Error" })
    }
    attachedRunId = body.attachedRunId
  }

  try {
    const conversation = await createConversation(userId, title, attachedRunId)
    return res.status(201).json(conversation)
  } catch (err) {
    console.error("Conversation create failed:", err)
    return res.status(500).json({ error: "Internal Server Error" })
  }
})

// GET /api/chat — the user's conversations, most recently active first.
chatRouter.get("/chat", async (req, res) => {
  try {
    return res.json(await listConversations(req.user!.id))
  } catch (err) {
    console.error("Conversation list failed:", err)
    return res.status(500).json({ error: "Internal Server Error" })
  }
})

// GET /api/chat/:id — conversation + full transcript.
chatRouter.get("/chat/:id", async (req, res) => {
  const { id } = req.params
  if (!UUID_RE.test(id)) return res.status(400).json({ error: "Invalid conversation id" })
  try {
    const conversation = await getConversation(id, req.user!.id)
    if (!conversation) return res.status(404).json({ error: "Conversation not found" })
    const messages = await getConversationMessages(id)
    const response: ChatDetailResponse = { conversation, messages }
    return res.json(response)
  } catch (err) {
    console.error("Conversation read failed:", err)
    return res.status(500).json({ error: "Internal Server Error" })
  }
})

// DELETE /api/chat/:id
chatRouter.delete("/chat/:id", async (req, res) => {
  const { id } = req.params
  if (!UUID_RE.test(id)) return res.status(400).json({ error: "Invalid conversation id" })
  try {
    const deleted = await deleteConversation(id, req.user!.id)
    if (!deleted) return res.status(404).json({ error: "Conversation not found" })
    return res.status(204).end()
  } catch (err) {
    console.error("Conversation delete failed:", err)
    return res.status(500).json({ error: "Internal Server Error" })
  }
})

// SSE helper — silently a no-op once the client is gone or the stream ended.
const sseWriter = (res: Response) => {
  let aborted = false
  res.on("close", () => {
    if (!res.writableEnded) aborted = true
  })
  return {
    send(event: "delta" | "tool" | "done" | "error", data: unknown): void {
      if (!aborted && !res.writableEnded) {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
      }
    }
  }
}

// POST /api/chat/:id/messages — send a message, stream the assistant's answer.
// Protocol (§S.5): `event: delta` {text} · `event: tool` {name} (additive
// extension for tool-call visibility) · `event: done` {messageId, usage} ·
// `event: error` {error}.
chatRouter.post("/chat/:id/messages", async (req, res) => {
  const userId = req.user!.id
  const { id } = req.params
  if (!UUID_RE.test(id)) return res.status(400).json({ error: "Invalid conversation id" })

  const body = (req.body ?? {}) as Record<string, unknown>
  const content = typeof body.content === "string" ? body.content.trim() : ""
  if (!content) return res.status(400).json({ error: "content is required" })
  if (content.length > MAX_MESSAGE_CHARS) {
    return res.status(400).json({ error: `content must be at most ${MAX_MESSAGE_CHARS} characters` })
  }

  try {
    const conversation = await getConversation(id, userId)
    if (!conversation) return res.status(404).json({ error: "Conversation not found" })

    // Same provider/model/key selection rules as analyze (§S.4).
    let selection: ResolvedSelection
    try {
      selection = await resolveSelection(userId, body.provider, body.model)
    } catch (err) {
      if (err instanceof SelectionError) return res.status(err.status).json({ error: err.message })
      throw err
    }

    // Optional context switch: attach a different run (or null to detach).
    let attachedRunId = conversation.attachedRunId
    let switched = false
    if (body.attachedRunId !== undefined) {
      if (body.attachedRunId === null) {
        switched = attachedRunId !== null
        attachedRunId = null
      } else if (typeof body.attachedRunId === "string" && UUID_RE.test(body.attachedRunId)) {
        const owned = await getRunById(body.attachedRunId, userId)
        if (!owned) return res.status(404).json({ error: "Run not found" })
        switched = body.attachedRunId !== conversation.attachedRunId
        attachedRunId = body.attachedRunId
      } else {
        return res.status(400).json({ error: "attachedRunId must be a UUID or null" })
      }
      if (switched) await updateConversationAttachedRun(id, attachedRunId)
    }

    // Only the currently attached run is in context (§S.5).
    const attachedRun = attachedRunId ? await getRunById(attachedRunId, userId) : null

    // Persist the user message (with the switch marker when it switched context).
    await insertChatMessage(id, "user", content, switched ? attachedRunId : null)
    if (conversation.title === DEFAULT_TITLE) {
      await updateConversationTitle(id, content.replace(/\s+/g, " ").slice(0, 60))
    }
    await touchConversation(id)

    const recent = await getRecentMessages(id, CONTEXT_MESSAGE_LIMIT)
    const turns: ChatTurn[] = recent.map((m) => ({ role: m.role, content: m.content }))

    // From here on, errors go over the stream, not as HTTP statuses.
    res.setHeader("Content-Type", "text/event-stream")
    res.setHeader("Cache-Control", "no-cache")
    res.setHeader("Connection", "keep-alive")
    res.setHeader("X-Accel-Buffering", "no")
    res.flushHeaders()
    const sse = sseWriter(res)

    try {
      const result = await runChatStream(selection.provider, {
        model: selection.model,
        apiKey: selection.apiKey,
        system: buildSystemPrompt(attachedRun),
        turns,
        tools: chatToolDefs,
        executeTool: (name, args) => executeChatTool(userId, name, args),
        onDelta: (text) => sse.send("delta", { text }),
        onTool: (name) => sse.send("tool", { name })
      })

      // Persist after the stream completes (§S.5), then close it out.
      const saved = await insertChatMessage(id, "assistant", result.text, null)
      await touchConversation(id)
      sse.send("done", { messageId: saved.id, usage: result.usage })
      return res.end()
    } catch (err) {
      if (err instanceof ProviderAuthError) {
        sse.send("error", {
          error: `The ${err.provider} API key was rejected by the provider. Check your API key in Settings.`
        })
      } else {
        console.error("Chat stream failed:", err)
        sse.send("error", { error: "The assistant is unavailable right now. Try again." })
      }
      return res.end()
    }
  } catch (err) {
    console.error("Chat message failed:", err)
    if (!res.headersSent) {
      return res.status(500).json({ error: "Internal Server Error" })
    }
    return res.end()
  }
})

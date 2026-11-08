"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowUp,
  ChatCircle,
  Paperclip,
  Plus,
  Trash,
  WarningCircle,
  Wrench,
  X
} from "@phosphor-icons/react"

import { ChatAttachDialog } from "@/components/ChatAttachDialog"
import { MarkdownLite } from "@/components/MarkdownLite"
import { ModelPicker } from "@/components/ModelPicker"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  AuthError,
  createConversation,
  deleteConversation as apiDeleteConversation,
  getConversation,
  getHistory,
  listConversations,
  sendChatMessage
} from "@/lib/api"
import { formatRelative } from "@/lib/format"
import { cn } from "@/lib/utils"
import type {
  ChatConversation,
  ChatMessage,
  HistoryItem,
  ModelSelection
} from "@/lib/types"

const TOOL_LABEL: Record<string, string> = {
  list_my_runs: "Looking up your analyses",
  get_run_analysis: "Reading another analysis"
}

let localCounter = 0
const localId = (): string => `local-${++localCounter}`

function onAuthErr(err: unknown): boolean {
  if (err instanceof AuthError) {
    window.location.assign("/login")
    return true
  }
  return false
}

export function ChatWorkspace({ conversationId }: { conversationId?: string }) {
  const router = useRouter()

  const [conversations, setConversations] = useState<ChatConversation[] | null>(null)
  const [runs, setRuns] = useState<HistoryItem[]>([])

  const [title, setTitle] = useState("")
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [attachedRunId, setAttachedRunId] = useState<string | null>(null)
  const [detailMissing, setDetailMissing] = useState(false)

  const [input, setInput] = useState("")
  const [selection, setSelection] = useState<ModelSelection | null>(null)
  const [streaming, setStreaming] = useState(false)
  const [toolActivity, setToolActivity] = useState<string | null>(null)
  const [streamError, setStreamError] = useState<string | null>(null)

  const streamingMsgId = useRef<string | null>(null)
  const lastUserContent = useRef<string | null>(null)
  const threadEnd = useRef<HTMLDivElement>(null)
  const runsById = new Map(runs.map((r) => [r.id, r]))

  const loadConversations = useCallback(async () => {
    try {
      setConversations(await listConversations())
    } catch (err) {
      if (onAuthErr(err)) return
      setConversations([])
    }
  }, [])

  // Mount: conversation list + run summaries (for attach picker and chips).
  useEffect(() => {
    void loadConversations()
    getHistory(1, 50)
      .then((h) => setRuns(h.runs))
      .catch((err) => {
        if (!onAuthErr(err)) setRuns([])
      })
  }, [loadConversations])

  // Active conversation: load its transcript + attachment.
  useEffect(() => {
    setStreamError(null)
    setToolActivity(null)
    if (!conversationId) {
      setMessages([])
      setTitle("")
      setAttachedRunId(null)
      setDetailMissing(false)
      return
    }
    let cancelled = false
    getConversation(conversationId)
      .then((detail) => {
        if (cancelled) return
        if (!detail) {
          setDetailMissing(true)
          return
        }
        setDetailMissing(false)
        setTitle(detail.conversation.title)
        setAttachedRunId(detail.conversation.attachedRunId)
        setMessages(detail.messages)
      })
      .catch((err) => {
        if (!onAuthErr(err)) setDetailMissing(true)
      })
    return () => {
      cancelled = true
    }
  }, [conversationId])

  useEffect(() => {
    threadEnd.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, toolActivity])

  const appendDelta = (text: string) => {
    const id = streamingMsgId.current
    if (!id) return
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, content: m.content + text } : m)))
  }

  const send = useCallback(
    async (content: string) => {
      const trimmed = content.trim()
      if (!trimmed || streaming || !conversationId) return

      lastUserContent.current = trimmed
      setStreamError(null)
      setToolActivity(null)
      setInput("")

      const userMsg: ChatMessage = {
        id: localId(),
        role: "user",
        content: trimmed,
        attachedRunId: null,
        createdAt: new Date().toISOString()
      }
      const asstId = localId()
      streamingMsgId.current = asstId
      setMessages((prev) => [
        ...prev,
        userMsg,
        { id: asstId, role: "assistant", content: "", attachedRunId: null, createdAt: new Date().toISOString() }
      ])
      setStreaming(true)

      try {
        await sendChatMessage(
          conversationId,
          {
            content: trimmed,
            attachedRunId,
            ...(selection ? { provider: selection.provider, model: selection.model } : {})
          },
          {
            onDelta: (t) => appendDelta(t),
            onTool: (name) => setToolActivity(TOOL_LABEL[name] ?? "Using a tool"),
            onDone: ({ messageId }) => {
              const localAsst = streamingMsgId.current
              setMessages((prev) =>
                prev.map((m) => (m.id === localAsst ? { ...m, id: messageId } : m))
              )
              setToolActivity(null)
              void loadConversations()
            },
            onError: (msg) => {
              const localAsst = streamingMsgId.current
              // drop the empty assistant placeholder, keep the user's message
              setMessages((prev) => prev.filter((m) => m.id !== localAsst || m.content !== ""))
              setStreamError(msg)
              setToolActivity(null)
            }
          }
        )
      } catch (err) {
        if (!onAuthErr(err)) {
          setStreamError("The connection to the assistant was lost. Try again.")
        }
      } finally {
        setStreaming(false)
        streamingMsgId.current = null
      }
    },
    [attachedRunId, conversationId, loadConversations, selection, streaming]
  )

  const startConversation = useCallback(async () => {
    try {
      const conv = await createConversation({})
      setConversations((prev) => [conv, ...(prev ?? [])])
      router.push(`/chat/${conv.id}`)
    } catch (err) {
      onAuthErr(err)
    }
  }, [router])

  const removeConversation = useCallback(
    async (id: string) => {
      if (!window.confirm("Delete this conversation? This cannot be undone.")) return
      try {
        await apiDeleteConversation(id)
        setConversations((prev) => (prev ? prev.filter((c) => c.id !== id) : prev))
        if (id === conversationId) router.push("/chat")
      } catch (err) {
        onAuthErr(err)
      }
    },
    [conversationId, router]
  )

  // Robust label: falls back to a generic name when the run isn't in the loaded
  // summaries (older than the first page), so an attachment never reads as absent.
  const runLabel = (id: string | null): string =>
    id ? (runsById.get(id)?.filename ?? "Attached analysis") : ""

  return (
    <div className="grid h-[calc(100dvh-11rem)] grid-cols-1 gap-4 md:grid-cols-[260px_1fr]">
      {/* Conversation list */}
      <aside className="flex min-h-0 flex-col rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border p-3">
          <span className="text-sm font-semibold text-foreground">Conversations</span>
          <Button size="sm" type="button" onClick={() => void startConversation()}>
            <Plus weight="bold" /> New
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {conversations === null ? (
            <div className="space-y-2" aria-busy="true">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-md bg-secondary/40" />
              ))}
            </div>
          ) : conversations.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">No conversations yet.</p>
          ) : (
            <ul className="space-y-1">
              {conversations.map((c) => (
                <li key={c.id}>
                  <div
                    className={cn(
                      "group flex items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors",
                      c.id === conversationId ? "bg-accent" : "hover:bg-accent/50"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => router.push(`/chat/${c.id}`)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="truncate font-medium text-foreground">{c.title}</div>
                      <div className="text-xs text-muted-foreground">{formatRelative(c.updatedAt)}</div>
                    </button>
                    <button
                      type="button"
                      aria-label="Delete conversation"
                      onClick={() => void removeConversation(c.id)}
                      className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus:opacity-100 group-hover:opacity-100"
                    >
                      <Trash size={15} weight="bold" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* Active thread */}
      <section className="flex min-h-0 flex-col rounded-lg border border-border bg-card">
        {!conversationId ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <ChatCircle size={32} weight="duotone" className="text-primary" />
            <div>
              <p className="text-sm font-medium text-foreground">Ask about your analyses</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Start a conversation and attach an analysis to discuss its risks and compliance.
              </p>
            </div>
            <Button size="sm" type="button" onClick={() => void startConversation()}>
              <Plus weight="bold" /> New conversation
            </Button>
          </div>
        ) : detailMissing ? (
          <div className="flex flex-1 items-center justify-center p-8">
            <p className="text-sm text-muted-foreground">This conversation could not be found.</p>
          </div>
        ) : (
          <>
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
              <h1 className="truncate text-sm font-semibold text-foreground">{title || "Conversation"}</h1>
              {attachedRunId ? (
                <span
                  className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-xs text-foreground"
                  title="Analysis in the assistant's context"
                >
                  <Paperclip size={12} weight="bold" className="text-primary" />
                  <span className="max-w-[22ch] truncate">{runLabel(attachedRunId)}</span>
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">No analysis attached</span>
              )}
            </header>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
              {messages.length === 0 && (
                <p className="rounded-md border border-border bg-secondary/30 p-4 text-sm text-muted-foreground">
                  Ask a question about the attached analysis, or ask the assistant to compare it with
                  another run.
                </p>
              )}
              {messages.map((m) => (
                <div key={m.id} className="space-y-4">
                  {/* Context-switch marker: this message re-attached the analysis. */}
                  {m.attachedRunId && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="h-px flex-1 bg-border" />
                      <span className="inline-flex items-center gap-1">
                        <Paperclip size={11} weight="bold" className="text-primary" />
                        Now discussing {runLabel(m.attachedRunId)}
                      </span>
                      <span className="h-px flex-1 bg-border" />
                    </div>
                  )}
                  {m.role === "user" ? (
                    <div className="flex justify-end">
                      <div className="max-w-[85%] whitespace-pre-wrap rounded-lg bg-primary/15 px-3.5 py-2.5 text-sm text-foreground">
                        {m.content}
                      </div>
                    </div>
                  ) : (
                    <div className="max-w-[92%]">
                      {m.content ? (
                        <MarkdownLite text={m.content} />
                      ) : streaming ? (
                        <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                          <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
                          Thinking...
                        </span>
                      ) : null}
                    </div>
                  )}
                </div>
              ))}
              {toolActivity && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Wrench size={13} weight="bold" className="text-primary" /> {toolActivity}...
                </div>
              )}
              {streamError && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3">
                  <span className="flex items-center gap-1.5 text-sm text-foreground">
                    <WarningCircle size={15} weight="bold" className="text-destructive" />
                    {streamError}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    disabled={streaming}
                    onClick={() => lastUserContent.current && void send(lastUserContent.current)}
                  >
                    Try again
                  </Button>
                </div>
              )}
              <div ref={threadEnd} />
            </div>

            <div className="border-t border-border p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <ChatAttachDialog
                    runs={runs}
                    attachedRunId={attachedRunId}
                    onSelect={setAttachedRunId}
                    disabled={streaming}
                  />
                  {attachedRunId && (
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary/50 px-2 py-1 text-xs text-foreground">
                      <Paperclip size={12} weight="bold" className="text-primary" />
                      <span className="max-w-[20ch] truncate">{runLabel(attachedRunId)}</span>
                      <button
                        type="button"
                        aria-label="Detach analysis"
                        disabled={streaming}
                        onClick={() => setAttachedRunId(null)}
                        className="text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
                      >
                        <X size={12} weight="bold" />
                      </button>
                    </span>
                  )}
                </div>
                <ModelPicker value={selection} onChange={setSelection} disabled={streaming} />
              </div>
              <div className="flex items-end gap-2">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault()
                      void send(input)
                    }
                  }}
                  placeholder="Ask about this analysis..."
                  className="min-h-[52px] flex-1 font-sans text-sm"
                  disabled={streaming}
                  aria-label="Message"
                />
                <Button
                  size="icon"
                  type="button"
                  disabled={streaming || input.trim() === ""}
                  onClick={() => void send(input)}
                  aria-label="Send message"
                >
                  <ArrowUp weight="bold" />
                </Button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  )
}

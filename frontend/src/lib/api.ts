import type {
  AnalyzeResponse,
  AuthUser,
  ChatConversation,
  ChatDetail,
  ChatUsage,
  HistoryResponse,
  ModelSelection,
  ModelsResponse,
  ProviderKeyInfo
} from "./types"

// On the server (RSC) use the in-network service URL; in the browser use the
// public URL (§5.3). Server Components have no browser cookies, so RSC callers
// pass a `cookieHeader` (built via lib/api-server.ts) to forward the session.
// When NEXT_PUBLIC_API_URL is unset (the Vercel deploy), the browser calls the
// same-origin /api proxy (app/api/[...path]/route.ts) so cookies stay first-party.
const BASE_URL =
  typeof window === "undefined"
    ? process.env.API_URL ?? "http://backend:3001" // server-side (RSC)
    : process.env.NEXT_PUBLIC_API_URL ?? "" // browser

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
}

// The session is missing or expired. Callers redirect to /login.
export class AuthError extends ApiError {
  constructor(message = "Not authenticated") {
    super(401, message)
    this.name = "AuthError"
  }
}

const cookieInit = (cookieHeader?: string): HeadersInit | undefined =>
  cookieHeader ? { cookie: cookieHeader } : undefined

const readError = async (res: Response, fallback: string): Promise<string> => {
  try {
    const body = (await res.json()) as { error?: string }
    if (body?.error) return body.error
  } catch {
    /* no JSON body */
  }
  return fallback
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export async function register(input: {
  email: string
  password: string
  displayName: string
}): Promise<AuthUser> {
  const res = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  })
  if (!res.ok) throw new ApiError(res.status, await readError(res, "Registration failed"))
  return (await res.json()) as AuthUser
}

export async function login(input: { email: string; password: string }): Promise<AuthUser> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  })
  if (!res.ok) throw new ApiError(res.status, await readError(res, "Sign-in failed"))
  return (await res.json()) as AuthUser
}

export async function logout(): Promise<void> {
  await fetch(`${BASE_URL}/api/auth/logout`, { method: "POST", credentials: "include" })
}

// Returns null when there is no valid session (the one 401 that is not an error).
export async function getMe(cookieHeader?: string): Promise<AuthUser | null> {
  const res = await fetch(`${BASE_URL}/api/auth/me`, {
    credentials: "include",
    cache: "no-store",
    headers: cookieInit(cookieHeader)
  })
  if (res.status === 401) return null
  if (!res.ok) throw new ApiError(res.status, `Failed to load session (${res.status})`)
  return (await res.json()) as AuthUser
}

// ── Analysis ────────────────────────────────────────────────────────────────

// POST /api/analyze. A 422 (all rows invalid) is returned as a normal result so
// the UI can render the validation report; 401 surfaces as AuthError. `selection`
// picks the LLM (§S.4); omitted → the platform default on the demo key.
export async function analyzePool(
  csvContent: string,
  filename?: string,
  selection?: ModelSelection | null
): Promise<AnalyzeResponse> {
  const res = await fetch(`${BASE_URL}/api/analyze`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      csvContent,
      filename,
      ...(selection ? { provider: selection.provider, model: selection.model } : {})
    })
  })

  if (res.status === 401) throw new AuthError()
  if (res.ok || res.status === 422) {
    return (await res.json()) as AnalyzeResponse
  }
  throw new ApiError(res.status, await readError(res, `Request failed (${res.status})`))
}

// ── Models & BYOK keys (§S.6) ───────────────────────────────────────────────

export async function getModels(): Promise<ModelsResponse> {
  const res = await fetch(`${BASE_URL}/api/models`, { credentials: "include", cache: "no-store" })
  if (res.status === 401) throw new AuthError()
  if (!res.ok) throw new ApiError(res.status, `Failed to load models (${res.status})`)
  return (await res.json()) as ModelsResponse
}

export async function getKeys(): Promise<ProviderKeyInfo[]> {
  const res = await fetch(`${BASE_URL}/api/keys`, { credentials: "include", cache: "no-store" })
  if (res.status === 401) throw new AuthError()
  if (!res.ok) throw new ApiError(res.status, `Failed to load keys (${res.status})`)
  return (await res.json()) as ProviderKeyInfo[]
}

export async function putKey(provider: string, apiKey: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/keys/${provider}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey })
  })
  if (res.status === 401) throw new AuthError()
  if (!res.ok) throw new ApiError(res.status, await readError(res, "Could not save the key"))
}

export async function deleteKey(provider: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/keys/${provider}`, {
    method: "DELETE",
    credentials: "include"
  })
  if (res.status === 401) throw new AuthError()
  if (!res.ok) throw new ApiError(res.status, await readError(res, "Could not remove the key"))
}

// ── Chat (§S.6) ─────────────────────────────────────────────────────────────

export async function createConversation(input: {
  title?: string
  attachedRunId?: string | null
}): Promise<ChatConversation> {
  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  })
  if (res.status === 401) throw new AuthError()
  if (!res.ok) throw new ApiError(res.status, await readError(res, "Could not start a conversation"))
  return (await res.json()) as ChatConversation
}

export async function listConversations(): Promise<ChatConversation[]> {
  const res = await fetch(`${BASE_URL}/api/chat`, { credentials: "include", cache: "no-store" })
  if (res.status === 401) throw new AuthError()
  if (!res.ok) throw new ApiError(res.status, `Failed to load conversations (${res.status})`)
  return (await res.json()) as ChatConversation[]
}

// Returns null on 404 so the workspace can fall back to the empty state.
export async function getConversation(id: string): Promise<ChatDetail | null> {
  const res = await fetch(`${BASE_URL}/api/chat/${id}`, { credentials: "include", cache: "no-store" })
  if (res.status === 401) throw new AuthError()
  if (res.status === 404) return null
  if (!res.ok) throw new ApiError(res.status, `Failed to load conversation (${res.status})`)
  return (await res.json()) as ChatDetail
}

export async function deleteConversation(id: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/chat/${id}`, { method: "DELETE", credentials: "include" })
  if (res.status === 401) throw new AuthError()
  if (!res.ok && res.status !== 404) {
    throw new ApiError(res.status, await readError(res, "Could not delete the conversation"))
  }
}

export interface ChatStreamHandlers {
  onDelta: (text: string) => void
  onTool: (name: string) => void
  onDone: (payload: { messageId: string; usage: ChatUsage }) => void
  onError: (message: string) => void
}

interface SendMessageBody {
  content: string
  attachedRunId?: string | null
  provider?: string
  model?: string
}

const dispatchFrame = (frame: string, handlers: ChatStreamHandlers): void => {
  let event = "message"
  let data = ""
  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim()
    else if (line.startsWith("data:")) data += line.slice(5).trim()
  }
  if (!data) return
  let payload: unknown
  try {
    payload = JSON.parse(data)
  } catch {
    return
  }
  const p = payload as Record<string, unknown>
  if (event === "delta") handlers.onDelta(String(p.text ?? ""))
  else if (event === "tool") handlers.onTool(String(p.name ?? ""))
  else if (event === "done") handlers.onDone(p as unknown as { messageId: string; usage: ChatUsage })
  else if (event === "error") handlers.onError(String(p.error ?? "Something went wrong"))
}

// POST /api/chat/:id/messages — streams the assistant reply over SSE. Pre-stream
// failures (selection 400, not-found 404) arrive as JSON and route to onError;
// mid-stream failures arrive as an `error` event.
export async function sendChatMessage(
  conversationId: string,
  body: SendMessageBody,
  handlers: ChatStreamHandlers,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/chat/${conversationId}/messages`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal
  })
  if (res.status === 401) throw new AuthError()
  if (!res.ok) {
    handlers.onError(await readError(res, `Request failed (${res.status})`))
    return
  }
  const reader = res.body?.getReader()
  if (!reader) {
    handlers.onError("The server did not return a stream")
    return
  }
  const decoder = new TextDecoder()
  let buffer = ""
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let idx: number
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 2)
      if (frame.trim() !== "") dispatchFrame(frame, handlers)
    }
  }
}

// GET /api/history — browser or RSC (pass cookieHeader from lib/api-server).
export async function getHistory(page = 1, limit = 10, cookieHeader?: string): Promise<HistoryResponse> {
  const res = await fetch(`${BASE_URL}/api/history?page=${page}&limit=${limit}`, {
    credentials: "include",
    cache: "no-store",
    headers: cookieInit(cookieHeader)
  })
  if (res.status === 401) throw new AuthError()
  if (!res.ok) {
    throw new ApiError(res.status, `Failed to load history (${res.status})`)
  }
  return (await res.json()) as HistoryResponse
}

// GET /api/history/:id — returns null on 404 so the detail page can notFound().
export async function getRun(id: string, cookieHeader?: string): Promise<AnalyzeResponse | null> {
  const res = await fetch(`${BASE_URL}/api/history/${id}`, {
    credentials: "include",
    cache: "no-store",
    headers: cookieInit(cookieHeader)
  })
  if (res.status === 401) throw new AuthError()
  if (res.status === 404) return null
  if (!res.ok) {
    throw new ApiError(res.status, `Failed to load run (${res.status})`)
  }
  return (await res.json()) as AnalyzeResponse
}

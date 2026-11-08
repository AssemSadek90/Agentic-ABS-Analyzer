import type { NextRequest } from "next/server"

// Same-origin proxy: browser → /api/* (this app) → backend /api/*.
//
// Deployed, the frontend and backend live on different domains. The session
// cookie must belong to the FRONTEND's domain: the (app) layout's server-side
// auth guard reads it via next/headers, and a cookie set by the backend's domain
// would be third-party (blocked by Safari, invisible to the guard). Routing the
// browser's API calls through here keeps Set-Cookie first-party. A route handler
// is used instead of a next.config rewrite so the SSE chat stream is passed
// through unbuffered.
//
// Locally under Docker the browser still talks to the backend directly
// (NEXT_PUBLIC_API_URL is set in docker-compose.yml), so this route is unused.

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300 // AI analysis + one retry can take a while

const BACKEND = (process.env.API_URL ?? "http://backend:3001").replace(/\/+$/, "")

// Request headers worth forwarding; everything else (host, x-vercel-*, …) is dropped.
const FORWARD_REQUEST = ["accept", "accept-language", "content-type", "cookie", "user-agent"]

// Response headers that must not be copied (fetch already decoded the body).
const DROP_RESPONSE = new Set(["connection", "content-encoding", "content-length", "keep-alive", "transfer-encoding", "set-cookie"])

async function proxy(req: NextRequest, { params }: { params: { path: string[] } }): Promise<Response> {
  const target = `${BACKEND}/api/${params.path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`

  const headers = new Headers()
  for (const name of FORWARD_REQUEST) {
    const value = req.headers.get(name)
    if (value) headers.set(name, value)
  }
  // Let the backend's login throttle see the real browser IP (trusted only with the secret).
  const secret = process.env.PROXY_SECRET
  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  if (secret && clientIp) {
    headers.set("x-abs-client-ip", clientIp)
    headers.set("x-abs-proxy-secret", secret)
  }

  const hasBody = req.method !== "GET" && req.method !== "HEAD"

  let upstream: Response
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers,
      body: hasBody ? await req.arrayBuffer() : undefined,
      redirect: "manual",
      cache: "no-store",
      signal: req.signal
    })
  } catch (err) {
    console.error("API proxy could not reach the backend:", err)
    return Response.json({ error: "Backend unavailable" }, { status: 502 })
  }

  const out = new Headers()
  upstream.headers.forEach((value, name) => {
    if (!DROP_RESPONSE.has(name.toLowerCase())) out.set(name, value)
  })
  for (const cookie of upstream.headers.getSetCookie()) out.append("set-cookie", cookie)

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: out
  })
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE }

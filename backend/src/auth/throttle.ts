import { timingSafeEqual } from "node:crypto"
import type { NextFunction, Request, Response } from "express"

// Simple in-memory login throttle per §S.3: 10 attempts / 15 minutes / IP.
// Good enough for dev/demo; the general rate-limiting layer arrives in Chunk 10.
const WINDOW_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 10

const attempts = new Map<string, { count: number; resetAt: number }>()

// On Vercel, browser requests reach us through the frontend's same-origin /api
// proxy, so req.ip is the proxy's address for everyone. The proxy forwards the
// browser's IP in x-abs-client-ip; it is trusted only alongside the shared
// PROXY_SECRET, so direct callers cannot spoof it to dodge the throttle.
const secretMatches = (given: string | undefined, expected: string): boolean => {
  if (!given) return false
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

const clientIp = (req: Request): string => {
  const secret = process.env.PROXY_SECRET
  const forwarded = req.get("x-abs-client-ip")
  if (secret && forwarded && secretMatches(req.get("x-abs-proxy-secret"), secret)) return forwarded
  return req.ip ?? "unknown"
}

export const loginThrottle = (req: Request, res: Response, next: NextFunction): void => {
  const now = Date.now()

  // Keep the map bounded: prune expired entries when it grows.
  if (attempts.size > 10_000) {
    for (const [key, entry] of attempts) {
      if (entry.resetAt <= now) attempts.delete(key)
    }
  }

  const ip = clientIp(req)
  const entry = attempts.get(ip)
  if (!entry || entry.resetAt <= now) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    next()
    return
  }
  entry.count += 1
  if (entry.count > MAX_ATTEMPTS) {
    res.status(429).json({ error: "Too many login attempts. Try again in a few minutes." })
    return
  }
  next()
}

import { Router } from "express"
import { sql } from "../db/client"
import { hashPassword, verifyPassword } from "../auth/password"
import {
  SESSION_COOKIE,
  createSession,
  destroySession,
  purgeExpiredSessions,
  sessionCookieOptions
} from "../auth/session"
import { requireAuth } from "../auth/middleware"
import { loginThrottle } from "../auth/throttle"

export const authRouter = Router()

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface UserRow {
  id: string
  email: string
  display_name: string
}

// POST /api/auth/register — create account + session (public).
authRouter.post("/register", async (req, res) => {
  const { email, password, displayName } = (req.body ?? {}) as Record<string, unknown>

  if (typeof email !== "string" || !EMAIL_RE.test(email.trim())) {
    return res.status(400).json({ error: "A valid email is required" })
  }
  if (typeof password !== "string" || password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" })
  }
  if (typeof displayName !== "string" || displayName.trim() === "") {
    return res.status(400).json({ error: "Display name is required" })
  }

  const normalizedEmail = email.trim().toLowerCase()
  try {
    const passwordHash = await hashPassword(password)
    const [user] = await sql<UserRow[]>`
      INSERT INTO users (email, password_hash, display_name)
      VALUES (${normalizedEmail}, ${passwordHash}, ${displayName.trim()})
      RETURNING id, email, display_name
    `
    const token = await createSession(user.id)
    res.cookie(SESSION_COOKIE, token, sessionCookieOptions())
    return res.status(201).json({ id: user.id, email: user.email, displayName: user.display_name })
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      return res.status(409).json({ error: "An account with this email already exists" })
    }
    console.error("Register failed:", err)
    return res.status(500).json({ error: "Internal Server Error" })
  }
})

// POST /api/auth/login — verify credentials + new session (public, throttled).
authRouter.post("/login", loginThrottle, async (req, res) => {
  const { email, password } = (req.body ?? {}) as Record<string, unknown>
  if (typeof email !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "Email and password are required" })
  }

  try {
    const [user] = await sql<(UserRow & { password_hash: string })[]>`
      SELECT id, email, display_name, password_hash
      FROM users
      WHERE email = ${email.trim().toLowerCase()}
    `
    // Uniform error for unknown email and wrong password (no account enumeration).
    const valid = user ? await verifyPassword(user.password_hash, password) : false
    if (!user || !valid) {
      return res.status(401).json({ error: "Invalid email or password" })
    }

    void purgeExpiredSessions().catch(() => {}) // opportunistic cleanup, never blocks login
    const token = await createSession(user.id)
    res.cookie(SESSION_COOKIE, token, sessionCookieOptions())
    return res.json({ id: user.id, email: user.email, displayName: user.display_name })
  } catch (err) {
    console.error("Login failed:", err)
    return res.status(500).json({ error: "Internal Server Error" })
  }
})

// POST /api/auth/logout — destroy the session and clear the cookie.
authRouter.post("/logout", async (req, res) => {
  const token: unknown = req.cookies?.[SESSION_COOKIE]
  if (typeof token === "string" && token !== "") {
    try {
      await destroySession(token)
    } catch (err) {
      console.error("Logout cleanup failed:", err)
    }
  }
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: "lax", path: "/" })
  return res.status(204).end()
})

// GET /api/auth/me — current user.
authRouter.get("/me", requireAuth, (req, res) => {
  return res.json(req.user)
})

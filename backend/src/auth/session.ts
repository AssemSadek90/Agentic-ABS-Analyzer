import { createHash, randomBytes } from "node:crypto"
import { sql } from "../db/client"

// §S.3: opaque 256-bit token in an httpOnly cookie; the DB stores only its sha256.

export const SESSION_COOKIE = "abs_session"

const ttlDays = (): number => {
  const n = Number(process.env.SESSION_TTL_DAYS)
  return Number.isFinite(n) && n > 0 ? n : 7
}

export const sessionCookieOptions = () => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: ttlDays() * 24 * 60 * 60 * 1000
})

const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex")

export interface AuthUser {
  id: string
  email: string
  displayName: string
}

export const createSession = async (userId: string): Promise<string> => {
  const token = randomBytes(32).toString("hex")
  const expiresAt = new Date(Date.now() + ttlDays() * 24 * 60 * 60 * 1000)
  await sql`
    INSERT INTO sessions (user_id, token_hash, expires_at)
    VALUES (${userId}, ${hashToken(token)}, ${expiresAt})
  `
  return token
}

export const getSessionUser = async (token: string): Promise<AuthUser | null> => {
  const rows = await sql<{ id: string; email: string; display_name: string }[]>`
    SELECT u.id, u.email, u.display_name
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ${hashToken(token)} AND s.expires_at > NOW()
  `
  const row = rows[0]
  return row ? { id: row.id, email: row.email, displayName: row.display_name } : null
}

export const destroySession = async (token: string): Promise<void> => {
  await sql`DELETE FROM sessions WHERE token_hash = ${hashToken(token)}`
}

// Lazy cleanup, called opportunistically (on login) — never on the hot path.
export const purgeExpiredSessions = async (): Promise<void> => {
  await sql`DELETE FROM sessions WHERE expires_at <= NOW()`
}

import type { NextFunction, Request, Response } from "express"
import { SESSION_COOKIE, getSessionUser, type AuthUser } from "./session"

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser
    }
  }
}

// Resolves the session cookie to req.user or ends the request with 401.
// Applied to every /api/* route except /health and /api/auth/*.
export const requireAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const token: unknown = req.cookies?.[SESSION_COOKIE]
  if (typeof token !== "string" || token === "") {
    res.status(401).json({ error: "Not authenticated" })
    return
  }
  try {
    const user = await getSessionUser(token)
    if (!user) {
      res.status(401).json({ error: "Not authenticated" })
      return
    }
    req.user = user
    next()
  } catch (err) {
    console.error("Session lookup failed:", err)
    res.status(500).json({ error: "Internal Server Error" })
  }
}

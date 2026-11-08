// Server-only helpers. This module imports next/headers, which cannot appear in
// client bundles — that is why cookie forwarding lives here instead of api.ts
// (the §S plan names this helper as part of api.ts; the split is required by
// Next's server/client module boundary).
import { cookies } from "next/headers"
import { getMe } from "./api"
import type { AuthUser } from "./types"

// Build a Cookie header from the incoming request so RSC fetches to the backend
// carry the session (§S.3: Server Components have no browser cookies).
export const cookieHeader = (): string =>
  cookies()
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ")

// Current user or null — never throws (backend down reads as signed-out, so the
// login page still renders while services restart).
export const getCurrentUser = async (): Promise<AuthUser | null> => {
  try {
    return await getMe(cookieHeader())
  } catch {
    return null
  }
}

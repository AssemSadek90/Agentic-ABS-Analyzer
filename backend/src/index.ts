import express from "express"
import cors from "cors"
import cookieParser from "cookie-parser"
import { analyzeRouter } from "./routes/analyze"
import { historyRouter } from "./routes/history"
import { authRouter } from "./routes/auth"
import { keysRouter } from "./routes/keys"
import { modelsRouter } from "./routes/models"
import { chatRouter } from "./routes/chat"
import { exportRouter } from "./routes/export"
import { cronRouter } from "./routes/cron"
import { requireAuth } from "./auth/middleware"
import { assertEncryptionKey } from "./ai/crypto"

// Express entry point for the ABS Report Analyzer backend.

// Fail fast on misconfiguration (§S.3): without a valid APP_ENCRYPTION_KEY the
// BYOK vault can neither store nor read keys. The error message says how to fix it.
assertEncryptionKey()

const app = express()

// On Vercel the app sits behind Vercel's proxy, which sets a trustworthy
// x-forwarded-for; trust it so req.ip is the caller, not the proxy.
if (process.env.VERCEL) app.set("trust proxy", true)

// Single-origin CORS with credentials so the session cookie flows (§S.3).
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? "http://localhost:3000"
app.use(cors({ origin: FRONTEND_ORIGIN, credentials: true }))
app.use(express.json({ limit: "10mb" }))
app.use(cookieParser())

app.get("/health", (_req, res) => {
  res.json({ status: "ok" })
})

// Public auth endpoints; everything else under /api requires a session.
app.use("/api/auth", authRouter)
// Scheduled jobs (Vercel Cron), guarded by CRON_SECRET instead of a session.
app.use("/api/cron", cronRouter)
app.use("/api", requireAuth, analyzeRouter)
app.use("/api", requireAuth, historyRouter)
app.use("/api", requireAuth, keysRouter)
app.use("/api", requireAuth, modelsRouter)
app.use("/api", requireAuth, chatRouter)
app.use("/api", requireAuth, exportRouter)

// Vercel runs the exported app as a Function; locally (Docker / tsx) we listen.
if (!process.env.VERCEL) {
  const PORT = Number(process.env.PORT) || 3001
  app.listen(PORT, () => {
    console.log(`Backend listening on http://localhost:${PORT}`)
  })
}

export default app

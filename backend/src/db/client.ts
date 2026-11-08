import postgres from "postgres"

// PostgreSQL client (postgres.js). Reads DATABASE_URL per ARCHITECTURE.md §6.
// The client is lazy — no connection is opened until the first query runs — so
// importing this module does not block server startup.
const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error("DATABASE_URL is not set")
}

// On Vercel every Function instance holds its own pool: keep it small, close idle
// connections, and skip prepared statements so it is safe behind a PgBouncer-style
// pooled endpoint (e.g. Neon's). Local Docker keeps the postgres.js defaults.
export const sql = postgres(
  connectionString,
  process.env.VERCEL ? { max: 5, idle_timeout: 20, prepare: false } : {}
)

// Schema migrator for hosted Postgres (e.g. Neon behind a Vercel deploy).
// Docker dev does not need this: initdb applies the same files on a fresh volume.
//
// Applies backend/src/db/migrations/*.sql in filename order, each in its own
// transaction, and records them in schema_migrations so re-running is a no-op.
// Meant for a FRESH database; one already initialised by Docker's initdb has no
// schema_migrations table and would fail on 001.
//
// Usage: DATABASE_URL=postgres://... npm run db:migrate
// Prefers DATABASE_URL_UNPOOLED (set by the Neon integration) because DDL such
// as CREATE EXTENSION belongs on a direct connection, not a pooled one.
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import postgres from "postgres"

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
if (!url) {
  console.error("Set DATABASE_URL (or DATABASE_URL_UNPOOLED) to the target database.")
  process.exit(1)
}

const dir = join(__dirname, "..", "src", "db", "migrations")
const sql = postgres(url, { max: 1, onnotice: () => {} })

const main = async (): Promise<void> => {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  const rows = await sql<{ filename: string }[]>`SELECT filename FROM schema_migrations`
  const applied = new Set(rows.map((r) => r.filename))

  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`skip     ${file}`)
      continue
    }
    const body = readFileSync(join(dir, file), "utf8")
    await sql.begin(async (tx) => {
      await tx.unsafe(body)
      await tx.unsafe("INSERT INTO schema_migrations (filename) VALUES ($1)", [file])
    })
    console.log(`applied  ${file}`)
  }
}

main()
  .then(() => sql.end())
  .catch(async (err) => {
    console.error("Migration failed:", err)
    await sql.end()
    process.exit(1)
  })

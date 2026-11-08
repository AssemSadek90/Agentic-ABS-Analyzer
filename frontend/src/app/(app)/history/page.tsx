import { redirect } from "next/navigation"

import { HistoryTable } from "@/components/HistoryTable"
import { AuthError, getHistory } from "@/lib/api"
import { cookieHeader } from "@/lib/api-server"

// Server Component: fetches the history at render time using the server-side
// base URL (API_URL=http://backend:3001 inside Docker, NOT localhost), with the
// session cookie forwarded (§S.3). Marked dynamic so the list is always fresh
// and is never fetched at build time.
export const dynamic = "force-dynamic"

const LIMIT = 10

export default async function HistoryPage({
  searchParams
}: {
  searchParams: { page?: string }
}) {
  const page = Math.max(1, Number.parseInt(searchParams.page ?? "1", 10) || 1)
  let data
  try {
    data = await getHistory(page, LIMIT, cookieHeader())
  } catch (err) {
    // Session died between the layout guard and this fetch.
    if (err instanceof AuthError) redirect("/login")
    throw err
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Analysis history</h1>
        <p className="mt-1 text-sm text-muted-foreground">Past runs, newest first.</p>
      </div>
      <HistoryTable data={data} />
    </div>
  )
}

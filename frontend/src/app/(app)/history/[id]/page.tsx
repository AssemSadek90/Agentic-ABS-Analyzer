import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr"

import { AnalysisResult } from "@/components/AnalysisResult"
import { ExportButtons } from "@/components/ExportButtons"
import { OpenInChatButton } from "@/components/OpenInChatButton"
import { AuthError, getRun } from "@/lib/api"
import { cookieHeader } from "@/lib/api-server"

// Server Component: fetches one run server-side (session cookie forwarded) and
// renders the shared AnalysisResult in a read-only view.
export const dynamic = "force-dynamic"

export default async function RunDetailPage({ params }: { params: { id: string } }) {
  let run
  try {
    run = await getRun(params.id, cookieHeader())
  } catch (err) {
    if (err instanceof AuthError) redirect("/login")
    throw err
  }
  if (!run) notFound()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/history"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft size={14} weight="bold" /> Back to history
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <ExportButtons runId={params.id} />
          <OpenInChatButton runId={params.id} />
        </div>
      </div>
      <AnalysisResult result={run} />
    </div>
  )
}

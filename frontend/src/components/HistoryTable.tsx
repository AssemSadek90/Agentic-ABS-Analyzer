"use client"

import { useRouter } from "next/navigation"
import { CaretLeft, CaretRight } from "@phosphor-icons/react"

import { Button } from "@/components/ui/button"
import { StatusBadge, type Severity } from "@/components/StatusBadge"
import { formatDateTime, formatEur } from "@/lib/format"
import type { HistoryResponse } from "@/lib/types"

const STATUS_LABEL: Record<string, string> = {
  success: "Success",
  partial: "Partial",
  failed: "Failed"
}

export function HistoryTable({ data }: { data: HistoryResponse }) {
  const router = useRouter()
  const { runs, total, page, limit } = data
  const totalPages = Math.max(1, Math.ceil(total / limit))

  if (runs.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card p-12 text-center">
        <p className="text-sm font-medium text-foreground">No analyses yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Run your first analysis to see it listed here.
        </p>
        <Button className="mt-4" size="sm" onClick={() => router.push("/analyze")} type="button">
          Go to Analyze
        </Button>
      </div>
    )
  }

  const goTo = (id: string) => router.push(`/history/${id}`)

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-3 font-medium">Date</th>
              <th className="px-3 py-3 font-medium">File</th>
              <th className="px-3 py-3 font-medium">Status</th>
              <th className="px-3 py-3 font-medium">Model</th>
              <th className="px-3 py-3 text-right font-medium">Assets</th>
              <th className="px-3 py-3 text-right font-medium">Volume</th>
              <th className="px-3 py-3 text-right font-medium">Flags</th>
              <th className="px-3 py-3 text-right font-medium">Risks</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {runs.map((run) => (
              <tr
                key={run.id}
                onClick={() => goTo(run.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") goTo(run.id)
                }}
                tabIndex={0}
                className="cursor-pointer transition-colors hover:bg-accent/40 focus:bg-accent/40 focus:outline-none"
              >
                <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">
                  {formatDateTime(run.createdAt)}
                </td>
                <td className="px-3 py-3 text-foreground">
                  <span className="block max-w-[20ch] truncate" title={run.filename ?? "Pasted data"}>
                    {run.filename ?? "Pasted data"}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <StatusBadge severity={run.status as Severity}>{STATUS_LABEL[run.status]}</StatusBadge>
                </td>
                <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-muted-foreground">
                  {run.model ?? "-"}
                </td>
                <td className="px-3 py-3 text-right font-mono text-muted-foreground">
                  {run.validRowCount}
                </td>
                <td className="px-3 py-3 text-right font-mono text-foreground">
                  {run.totalPoolVolume === null ? "N/A" : formatEur(run.totalPoolVolume)}
                </td>
                <td className="px-3 py-3 text-right font-mono text-muted-foreground">
                  {run.esmaFlagCount ?? "-"}
                </td>
                <td className="px-3 py-3 text-right font-mono text-muted-foreground">
                  {run.riskSignalCount ?? "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {total} {total === 1 ? "run" : "runs"} · page {page} of {totalPages}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => router.push(`/history?page=${page - 1}`)}
            type="button"
          >
            <CaretLeft weight="bold" /> Prev
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => router.push(`/history?page=${page + 1}`)}
            type="button"
          >
            Next <CaretRight weight="bold" />
          </Button>
        </div>
      </div>
    </div>
  )
}

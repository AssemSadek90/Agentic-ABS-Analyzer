"use client"

import { useState } from "react"
import { Paperclip } from "@phosphor-icons/react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog"
import { StatusBadge, type Severity } from "@/components/StatusBadge"
import { formatDateTime, formatEur } from "@/lib/format"
import type { HistoryItem } from "@/lib/types"

// Picker for choosing which analysis is attached as chat context. Reuses the
// history summaries the workspace already loaded.
export function ChatAttachDialog({
  runs,
  attachedRunId,
  onSelect,
  disabled
}: {
  runs: HistoryItem[]
  attachedRunId: string | null
  onSelect: (runId: string | null) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)

  const choose = (id: string | null) => {
    onSelect(id)
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" type="button" disabled={disabled}>
          <Paperclip weight="bold" /> Attach analysis
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Attach an analysis</DialogTitle>
          <DialogDescription>
            Only the attached analysis is kept in the assistant&apos;s context. It can still look up
            your other runs when you ask.
          </DialogDescription>
        </DialogHeader>

        {runs.length === 0 ? (
          <p className="rounded-md border border-border bg-secondary/40 p-4 text-sm text-muted-foreground">
            You have no analyses yet. Run one from the Analyze page first.
          </p>
        ) : (
          <div className="max-h-80 space-y-1.5 overflow-y-auto">
            {runs.map((run) => {
              const active = run.id === attachedRunId
              return (
                <button
                  key={run.id}
                  type="button"
                  onClick={() => choose(run.id)}
                  className={
                    "flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-left text-sm transition-colors " +
                    (active
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary/50 hover:bg-accent/40")
                  }
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium text-foreground">
                      {run.filename ?? "Pasted data"}
                    </div>
                    <div className="font-mono text-xs text-muted-foreground">
                      {formatDateTime(run.createdAt)}
                      {run.totalPoolVolume !== null ? ` · ${formatEur(run.totalPoolVolume)}` : ""}
                    </div>
                  </div>
                  <StatusBadge severity={run.status as Severity}>{run.status}</StatusBadge>
                </button>
              )
            })}
          </div>
        )}

        {attachedRunId && (
          <div className="flex justify-end border-t border-border pt-3">
            <Button variant="ghost" size="sm" type="button" onClick={() => choose(null)}>
              Detach current analysis
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

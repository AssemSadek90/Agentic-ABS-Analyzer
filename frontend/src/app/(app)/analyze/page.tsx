"use client"

import { useEffect, useRef, useState } from "react"
import { ArrowClockwise, WarningCircle } from "@phosphor-icons/react"

import { AnalysisResult } from "@/components/AnalysisResult"
import { ExportButtons } from "@/components/ExportButtons"
import { ModelPicker } from "@/components/ModelPicker"
import { UploadPanel } from "@/components/UploadPanel"
import { Button } from "@/components/ui/button"
import { useAnalysis } from "@/hooks/useAnalysis"
import type { ModelSelection } from "@/lib/types"

function AnalyzingSkeleton({ stage }: { stage: string }) {
  return (
    <div className="space-y-6" aria-live="polite" aria-busy="true">
      <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-5 py-4">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <span className="text-sm font-medium text-foreground">{stage}</span>
      </div>
      <div className="h-28 animate-pulse rounded-lg border border-border bg-card" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-md border border-border bg-card" />
        ))}
      </div>
    </div>
  )
}

export default function AnalyzePage() {
  const { state, result, error, lastInput, analyze, retry, reset } = useAnalysis()
  const [modelSel, setModelSel] = useState<ModelSelection | null>(null)
  const progressRef = useRef<HTMLDivElement>(null)

  const busy = state === "uploading" || state === "analyzing"
  const stage = state === "uploading" ? "Validating data..." : "Running the AI analysis..."

  // Bring the loading indicator into view so the user sees that work started
  // (the upload panel can push it below the fold).
  useEffect(() => {
    if (busy) progressRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
  }, [busy])

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Analyze asset pool</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Deterministic metrics computed in code, qualitative review by the model you choose.
          </p>
        </div>
        {state === "success" && result && (
          <div className="flex flex-wrap items-center gap-2">
            <ExportButtons runId={result.run.id} />
            <Button variant="outline" size="sm" onClick={reset} type="button">
              New analysis
            </Button>
          </div>
        )}
      </div>

      {state !== "success" && (
        <>
          <div className="flex justify-end">
            <ModelPicker value={modelSel} onChange={setModelSel} disabled={busy} />
          </div>
          <UploadPanel
            onSubmit={(csvContent, filename) => void analyze(csvContent, filename, modelSel)}
            busy={busy}
            initialContent={lastInput?.csvContent}
            initialFilename={lastInput?.filename}
          />
        </>
      )}

      {error && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4">
          <div className="flex items-start gap-3">
            <WarningCircle size={20} className="mt-0.5 shrink-0 text-destructive" weight="duotone" />
            <div>
              <p className="text-sm font-medium text-foreground">Analysis failed</p>
              <p className="mt-1 text-sm text-muted-foreground">{error}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={retry} type="button">
            <ArrowClockwise weight="bold" /> Try again
          </Button>
        </div>
      )}

      <div ref={progressRef}>{busy && <AnalyzingSkeleton stage={stage} />}</div>

      {state === "success" && result && <AnalysisResult result={result} />}
    </div>
  )
}

"use client"

import { useCallback, useRef, useState } from "react"
import { ArrowRight, DownloadSimple, FileCsv, UploadSimple } from "@phosphor-icons/react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { SAMPLE_CSV, SAMPLE_FILENAME } from "@/lib/sample"

interface UploadPanelProps {
  onSubmit: (csvContent: string, filename?: string) => void
  busy: boolean
  initialContent?: string
  initialFilename?: string
}

// Count data rows (non-empty lines minus the header) for the preview.
function countRows(csv: string): number {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim() !== "")
  return Math.max(0, lines.length - 1)
}

export function UploadPanel({ onSubmit, busy, initialContent = "", initialFilename }: UploadPanelProps) {
  const [content, setContent] = useState(initialContent)
  const [filename, setFilename] = useState<string | undefined>(initialFilename)
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const readFile = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      setContent(String(reader.result ?? ""))
      setFilename(file.name)
    }
    reader.readAsText(file)
  }, [])

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setDragging(false)
      const file = e.dataTransfer.files?.[0]
      if (file) readFile(file)
    },
    [readFile]
  )

  const downloadSample = useCallback(() => {
    const blob = new Blob([SAMPLE_CSV], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = SAMPLE_FILENAME
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }, [])

  const loadSample = useCallback(() => {
    setContent(SAMPLE_CSV)
    setFilename(SAMPLE_FILENAME)
  }, [])

  const rowCount = content.trim() ? countRows(content) : 0
  const canSubmit = content.trim().length > 0 && !busy

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="border-b border-border p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Asset pool input
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload a CSV of the ABS asset pool, or paste the rows directly.
        </p>
      </div>

      <div className="space-y-4 p-5">
        {/* Drag-and-drop / browse zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click()
          }}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border px-6 py-10 text-center transition-colors",
            dragging ? "border-primary bg-primary/5" : "hover:border-primary/60 hover:bg-accent/40"
          )}
        >
          <UploadSimple size={28} className="text-primary" weight="duotone" />
          <p className="text-sm font-medium text-foreground">Drop a CSV file here, or click to browse</p>
          <p className="text-xs text-muted-foreground">Plain CSV with a header row.</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) readFile(file)
            }}
          />
        </div>

        <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          or paste data
          <span className="h-px flex-1 bg-border" />
        </div>

        <Textarea
          value={content}
          onChange={(e) => {
            setContent(e.target.value)
            if (filename) setFilename(undefined)
          }}
          placeholder="asset_id,asset_type,origination_date,maturity_date,outstanding_balance,..."
          aria-label="Paste CSV data"
        />

        {content.trim() && (
          <div className="flex items-center gap-2 rounded-md border border-border bg-secondary/40 px-3 py-2 text-sm">
            <FileCsv size={18} className="text-primary" weight="duotone" />
            <span className="font-medium text-foreground">{filename ?? "Pasted data"}</span>
            <span className="text-muted-foreground">
              {rowCount} {rowCount === 1 ? "row" : "rows"}
            </span>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={downloadSample} type="button">
              <DownloadSimple weight="bold" /> Download sample
            </Button>
            <Button variant="ghost" size="sm" onClick={loadSample} type="button">
              Load sample
            </Button>
          </div>
          <Button
            onClick={() => onSubmit(content, filename)}
            disabled={!canSubmit}
            type="button"
          >
            Analyze pool <ArrowRight weight="bold" />
          </Button>
        </div>
      </div>
    </section>
  )
}

"use client"

import { useState } from "react"
import { FilePdf, FileXls } from "@phosphor-icons/react"

import { Button } from "@/components/ui/button"

// Unset on Vercel → same-origin /api proxy (see lib/api.ts).
const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? ""

// Downloads the run's report from the backend (built server-side from the DB).
export function ExportButtons({ runId }: { runId: string }) {
  const [busy, setBusy] = useState<"xlsx" | "pdf" | null>(null)
  const [error, setError] = useState(false)

  const download = async (format: "xlsx" | "pdf") => {
    setBusy(format)
    setError(false)
    try {
      const res = await fetch(`${BASE_URL}/api/history/${runId}/export?format=${format}`, {
        credentials: "include"
      })
      if (res.status === 401) {
        window.location.assign("/login")
        return
      }
      if (!res.ok) {
        setError(true)
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `abs-analysis-${runId.slice(0, 8)}.${format}`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch {
      setError(true)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        type="button"
        disabled={busy !== null}
        onClick={() => void download("xlsx")}
      >
        <FileXls weight="duotone" /> {busy === "xlsx" ? "Preparing..." : "XLSX"}
      </Button>
      <Button
        variant="outline"
        size="sm"
        type="button"
        disabled={busy !== null}
        onClick={() => void download("pdf")}
      >
        <FilePdf weight="duotone" /> {busy === "pdf" ? "Preparing..." : "PDF"}
      </Button>
      {error && <span className="text-xs text-destructive">Export failed. Try again.</span>}
    </div>
  )
}

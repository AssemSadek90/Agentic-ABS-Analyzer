"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { analyzePool, ApiError, AuthError } from "@/lib/api"
import type { AnalyzeResponse, ModelSelection } from "@/lib/types"

export type AnalysisState = "idle" | "uploading" | "analyzing" | "success" | "error"

interface SubmittedInput {
  csvContent: string
  filename?: string
  selection?: ModelSelection | null
}

// Exported so the sign-out flow (UserMenu) can clear this per-user cache.
export const RESULT_STORAGE_KEY = "abs-analyzer:last-result"
const STORAGE_KEY = RESULT_STORAGE_KEY

interface UseAnalysis {
  state: AnalysisState
  result: AnalyzeResponse | null
  error: string | null
  lastInput: SubmittedInput | null
  analyze: (csvContent: string, filename?: string, selection?: ModelSelection | null) => Promise<void>
  retry: () => void
  reset: () => void
}

// State machine for the upload → analyze flow. Persists the last result in
// sessionStorage so a refresh doesn't lose it, and keeps the last submitted
// input so an error path can preserve and retry the uploaded data.
export function useAnalysis(): UseAnalysis {
  const [state, setState] = useState<AnalysisState>("idle")
  const [result, setResult] = useState<AnalyzeResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const lastInput = useRef<SubmittedInput | null>(null)

  // Hydrate the last result from sessionStorage on mount.
  useEffect(() => {
    try {
      const cached = sessionStorage.getItem(STORAGE_KEY)
      if (cached) {
        setResult(JSON.parse(cached) as AnalyzeResponse)
        setState("success")
      }
    } catch {
      /* ignore malformed cache */
    }
  }, [])

  const analyze = useCallback(async (csvContent: string, filename?: string, selection?: ModelSelection | null) => {
    lastInput.current = { csvContent, filename, selection }
    setError(null)
    setState("uploading")
    // Brief validating phase so the UI can show the first stage label.
    await new Promise((resolve) => setTimeout(resolve, 150))
    setState("analyzing")
    try {
      const data = await analyzePool(csvContent, filename, selection)
      setResult(data)
      setState("success")
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data))
      } catch {
        /* sessionStorage may be unavailable; non-fatal */
      }
    } catch (err) {
      if (err instanceof AuthError) {
        // Session expired mid-use: back to sign-in (input is lost, session is gone).
        window.location.assign("/login")
        return
      }
      const message =
        err instanceof ApiError
          ? err.message
          : "Could not reach the analysis service. Check that the backend is running and try again."
      setError(message)
      setState("error")
    }
  }, [])

  const retry = useCallback(() => {
    if (lastInput.current) {
      void analyze(lastInput.current.csvContent, lastInput.current.filename, lastInput.current.selection)
    }
  }, [analyze])

  const reset = useCallback(() => {
    lastInput.current = null
    setResult(null)
    setError(null)
    setState("idle")
    try {
      sessionStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }, [])

  return { state, result, error, lastInput: lastInput.current, analyze, retry, reset }
}

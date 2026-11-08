"use client"

import { useEffect, useMemo, useState } from "react"

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select"
import { AuthError, getModels } from "@/lib/api"
import type { ModelSelection, ModelsResponse } from "@/lib/types"

const PROVIDER_LABEL: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  gemini: "Gemini"
}

// Relative token cost / capability. Amber = pricier, teal = cheapest.
const TIER: Record<string, { label: string; cls: string }> = {
  high: { label: "High", cls: "text-warning" },
  medium: { label: "Medium", cls: "text-info" },
  low: { label: "Low", cls: "text-success" }
}

function TierTag({ tier }: { tier: string }) {
  const t = TIER[tier]
  if (!t) return null
  return (
    <span className={`text-[10px] font-medium uppercase tracking-wide ${t.cls}`} title="Relative token cost">
      {t.label}
    </span>
  )
}

// The catalog is refreshed from the providers daily; flag recent releases.
const NEW_WINDOW_DAYS = 45
const isNew = (releasedAt?: string | null): boolean => {
  if (!releasedAt) return false
  const t = Date.parse(releasedAt)
  return Number.isFinite(t) && Date.now() - t < NEW_WINDOW_DAYS * 24 * 60 * 60 * 1000
}

function Trailing({ tier, releasedAt }: { tier: string; releasedAt?: string | null }) {
  return (
    <span className="flex items-center gap-2">
      {isNew(releasedAt) && (
        <span className="rounded-sm bg-primary/15 px-1 text-[10px] font-medium uppercase tracking-wide text-primary">
          New
        </span>
      )}
      <TierTag tier={tier} />
    </span>
  )
}

const DEFAULT_VALUE = "default"
const encode = (s: ModelSelection): string => `${s.provider}::${s.model}`

interface ModelPickerProps {
  value: ModelSelection | null // null = platform default (server demo key)
  onChange: (value: ModelSelection | null) => void
  disabled?: boolean
}

// Compact LLM picker for the analyze flow. Selecting nothing runs the platform
// default on the demo key; per-provider entries are gated on a stored key
// (Anthropic excepted — it falls back to the demo key, §S.4).
export function ModelPicker({ value, onChange, disabled }: ModelPickerProps) {
  const [data, setData] = useState<ModelsResponse | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    getModels()
      .then(setData)
      .catch((err) => {
        if (err instanceof AuthError) {
          window.location.assign("/login")
          return
        }
        setFailed(true)
      })
  }, [])

  // The model list is dynamic: if the current choice dropped out of the
  // catalog (retired or superseded), fall back to the platform default.
  useEffect(() => {
    if (!data || !value) return
    const listed = data.providers
      .find((p) => p.id === value.provider)
      ?.models.some((m) => m.id === value.model)
    if (!listed) onChange(null)
  }, [data, value, onChange])

  const defaultLabel = useMemo(() => {
    if (!data) return ""
    const p = data.providers.find((x) => x.id === data.serverDefault.provider)
    return p?.models.find((m) => m.id === data.serverDefault.model)?.label ?? data.serverDefault.model
  }, [data])

  const hint = useMemo(() => {
    if (!data) return ""
    if (!value) return "Runs on the platform demo key"
    const p = data.providers.find((x) => x.id === value.provider)
    return p?.hasKey ? "Runs on your stored key" : "Runs on the platform demo key"
  }, [data, value])

  // The picker is an enhancement: if it cannot load, analyses still run on the
  // default, so fail quiet and small.
  if (failed) return null

  if (!data) {
    return <div className="h-9 w-64 animate-pulse rounded-md border border-border bg-card" aria-hidden />
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">Model</span>
        <Select
          disabled={disabled}
          value={value ? encode(value) : DEFAULT_VALUE}
          onValueChange={(v) => {
            if (v === DEFAULT_VALUE) {
              onChange(null)
              return
            }
            const [provider, model] = v.split("::")
            onChange({ provider, model })
          }}
        >
          <SelectTrigger className="h-9 w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={DEFAULT_VALUE}>Default ({defaultLabel})</SelectItem>
            {data.providers
              .filter((p) => p.models.length > 0)
              .map((p) => (
                <SelectGroup key={p.id}>
                  <SelectSeparator />
                  <SelectLabel>{PROVIDER_LABEL[p.id] ?? p.id}</SelectLabel>
                  {p.models.map((m) => (
                    <SelectItem
                      key={m.id}
                      value={encode({ provider: p.id, model: m.id })}
                      disabled={!p.hasKey && p.id !== "anthropic"}
                      trailing={<Trailing tier={m.tier} releasedAt={m.releasedAt} />}
                    >
                      {m.label}
                      {!p.hasKey && p.id !== "anthropic" ? " (add a key in Settings)" : ""}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
          </SelectContent>
        </Select>
      </div>
      <span className="text-xs text-muted-foreground">
        {hint} · <span className="text-warning">High</span>/
        <span className="text-info">Medium</span>/<span className="text-success">Low</span> token cost
      </span>
    </div>
  )
}

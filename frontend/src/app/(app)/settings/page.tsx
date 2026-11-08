"use client"

import { useCallback, useEffect, useState } from "react"
import { Key, WarningCircle } from "@phosphor-icons/react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { AuthError, ApiError, deleteKey, getKeys, putKey } from "@/lib/api"
import { formatDateTime } from "@/lib/format"
import type { ProviderKeyInfo } from "@/lib/types"

const PROVIDERS: Array<{ id: string; label: string; placeholder: string; available: boolean }> = [
  { id: "anthropic", label: "Anthropic", placeholder: "sk-ant-...", available: true },
  { id: "openai", label: "OpenAI", placeholder: "sk-...", available: true },
  { id: "gemini", label: "Google Gemini", placeholder: "AIza...", available: true }
]

function ProviderKeyRow({
  provider,
  label,
  placeholder,
  available,
  info,
  onChanged
}: {
  provider: string
  label: string
  placeholder: string
  available: boolean
  info: ProviderKeyInfo | undefined
  onChanged: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [apiKey, setApiKey] = useState("")
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    if (!apiKey.trim()) return
    setSaving(true)
    setError(null)
    try {
      await putKey(provider, apiKey.trim())
      setApiKey("")
      setEditing(false)
      onChanged()
    } catch (err) {
      if (err instanceof AuthError) {
        window.location.assign("/login")
        return
      }
      setError(err instanceof ApiError ? err.message : "Could not save the key. Try again.")
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!confirmRemove) {
      setConfirmRemove(true)
      return
    }
    setRemoving(true)
    setError(null)
    try {
      await deleteKey(provider)
      setConfirmRemove(false)
      onChanged()
    } catch (err) {
      if (err instanceof AuthError) {
        window.location.assign("/login")
        return
      }
      setError(err instanceof ApiError ? err.message : "Could not remove the key. Try again.")
    } finally {
      setRemoving(false)
    }
  }

  const showForm = available && (!info || editing)

  return (
    <div className="border-t border-border py-4 first:border-t-0 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Key size={18} weight="duotone" className={available ? "text-primary" : "text-muted-foreground"} />
          <div>
            <div className="text-sm font-medium text-foreground">{label}</div>
            {info ? (
              <div className="font-mono text-xs text-muted-foreground">
                Key ending in {info.last4} · added {formatDateTime(info.createdAt)}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">
                {available ? "No key stored" : "Arrives in a later build step"}
              </div>
            )}
          </div>
        </div>

        {available && info && !editing && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" type="button" onClick={() => setEditing(true)}>
              Replace
            </Button>
            <Button
              variant={confirmRemove ? "destructive" : "ghost"}
              size="sm"
              type="button"
              disabled={removing}
              onClick={() => void remove()}
              onBlur={() => setConfirmRemove(false)}
            >
              {removing ? "Removing..." : confirmRemove ? "Confirm removal" : "Remove"}
            </Button>
          </div>
        )}
      </div>

      {showForm && (
        <form
          className="mt-3 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <Input
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={placeholder}
            aria-label={`${label} API key`}
            className="w-72 font-mono text-xs"
            disabled={saving}
          />
          <Button type="submit" size="sm" disabled={saving || apiKey.trim() === ""}>
            {saving ? "Validating..." : "Save key"}
          </Button>
          {editing && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setEditing(false)
                setApiKey("")
                setError(null)
              }}
            >
              Cancel
            </Button>
          )}
        </form>
      )}

      {error && (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-destructive">
          <WarningCircle size={14} weight="bold" /> {error}
        </p>
      )}
    </div>
  )
}

export default function SettingsPage() {
  const [keys, setKeys] = useState<ProviderKeyInfo[] | null>(null)
  const [loadError, setLoadError] = useState(false)

  const load = useCallback(() => {
    getKeys()
      .then(setKeys)
      .catch((err) => {
        if (err instanceof AuthError) {
          window.location.assign("/login")
          return
        }
        setLoadError(true)
      })
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Provider keys and model defaults for your analyses.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>LLM provider keys</CardTitle>
          <p className="text-sm text-muted-foreground">
            Keys are validated with the provider, encrypted at rest, and never displayed again.
            Without a key, analyses run on the platform demo key with the default model.
          </p>
        </CardHeader>
        <CardContent>
          {loadError ? (
            <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-4">
              <p className="text-sm text-foreground">Could not load your keys.</p>
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() => {
                  setLoadError(false)
                  load()
                }}
              >
                Try again
              </Button>
            </div>
          ) : keys === null ? (
            <div className="space-y-3" aria-busy="true">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-md border border-border bg-secondary/40" />
              ))}
            </div>
          ) : (
            <div>
              {PROVIDERS.map((p) => (
                <ProviderKeyRow
                  key={p.id}
                  provider={p.id}
                  label={p.label}
                  placeholder={p.placeholder}
                  available={p.available}
                  info={keys.find((k) => k.provider === p.id)}
                  onChanged={load}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

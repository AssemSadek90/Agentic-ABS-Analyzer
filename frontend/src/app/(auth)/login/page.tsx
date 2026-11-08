"use client"

import { useState, type FormEvent } from "react"
import Link from "next/link"
import { WarningCircle } from "@phosphor-icons/react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ApiError, login } from "@/lib/api"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const errs: typeof fieldErrors = {}
    if (!EMAIL_RE.test(email.trim())) errs.email = "Enter a valid email address"
    if (password.length === 0) errs.password = "Password is required"
    setFieldErrors(errs)
    setFormError(null)
    if (Object.keys(errs).length > 0) return

    setBusy(true)
    try {
      await login({ email: email.trim(), password })
      window.location.href = "/analyze" // full navigation so the server shell picks up the session
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : "Could not reach the server. Try again."
      )
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <h1 className="text-lg font-semibold text-foreground">Sign in</h1>
        <p className="text-sm text-muted-foreground">Access your analyses and history.</p>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} noValidate className="space-y-4">
          {formError && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-foreground">
              <WarningCircle size={16} className="mt-0.5 shrink-0 text-destructive" weight="duotone" />
              {formError}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
            />
            {fieldErrors.email && <p className="text-xs text-destructive">{fieldErrors.email}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
            />
            {fieldErrors.password && (
              <p className="text-xs text-destructive">{fieldErrors.password}</p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={busy}>
            {busy && (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
            )}
            {busy ? "Signing in..." : "Sign in"}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            No account yet?{" "}
            <Link href="/register" className="text-primary hover:underline">
              Create one
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  )
}

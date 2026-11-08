"use client"

import { useState, type FormEvent } from "react"
import Link from "next/link"
import { WarningCircle } from "@phosphor-icons/react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ApiError, register } from "@/lib/api"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function RegisterPage() {
  const [email, setEmail] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [password, setPassword] = useState("")
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string
    displayName?: string
    password?: string
  }>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const errs: typeof fieldErrors = {}
    if (!EMAIL_RE.test(email.trim())) errs.email = "Enter a valid email address"
    if (displayName.trim() === "") errs.displayName = "Display name is required"
    if (password.length < 8) errs.password = "Use at least 8 characters"
    setFieldErrors(errs)
    setFormError(null)
    if (Object.keys(errs).length > 0) return

    setBusy(true)
    try {
      await register({ email: email.trim(), password, displayName: displayName.trim() })
      window.location.href = "/analyze"
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
        <h1 className="text-lg font-semibold text-foreground">Create account</h1>
        <p className="text-sm text-muted-foreground">
          Your analyses and history stay private to your account.
        </p>
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
            <Label htmlFor="displayName">Display name</Label>
            <Input
              id="displayName"
              autoComplete="name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              disabled={busy}
            />
            {fieldErrors.displayName && (
              <p className="text-xs text-destructive">{fieldErrors.displayName}</p>
            )}
          </div>

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
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
            />
            <p className="text-xs text-muted-foreground">At least 8 characters.</p>
            {fieldErrors.password && (
              <p className="text-xs text-destructive">{fieldErrors.password}</p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={busy}>
            {busy && (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
            )}
            {busy ? "Creating account..." : "Create account"}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            Already registered?{" "}
            <Link href="/login" className="text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  )
}

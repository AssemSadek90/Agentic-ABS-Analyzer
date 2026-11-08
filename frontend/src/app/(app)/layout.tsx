import type { ReactNode } from "react"
import Link from "next/link"
import { redirect } from "next/navigation"

import { UserMenu } from "@/components/UserMenu"
import { getCurrentUser } from "@/lib/api-server"

// Server-side auth guard for every app page: the session cookie is forwarded to
// the backend, and an anonymous visitor never sees a protected shell.
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser()
  if (!user) redirect("/login")

  return (
    <>
      <header className="border-b border-border bg-card/60 backdrop-blur">
        <nav className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <Link href="/analyze" className="flex items-baseline gap-2.5">
            <span className="font-semibold tracking-tight text-primary">ABS</span>
            <span className="text-sm text-muted-foreground">Analyzer</span>
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/analyze" className="text-foreground transition-colors hover:text-primary">
              Analyze
            </Link>
            <Link
              href="/history"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              History
            </Link>
            <Link
              href="/chat"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Chat
            </Link>
            <UserMenu user={user} />
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
    </>
  )
}

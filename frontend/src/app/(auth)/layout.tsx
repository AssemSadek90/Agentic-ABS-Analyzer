import type { ReactNode } from "react"
import { redirect } from "next/navigation"

import { getCurrentUser } from "@/lib/api-server"

// Sign-in shell: already-authenticated visitors go straight to the app.
export default async function AuthLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser()
  if (user) redirect("/analyze")

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center px-6 py-12">
      <div className="mb-8 flex items-baseline gap-2.5">
        <span className="text-lg font-semibold tracking-tight text-primary">ABS</span>
        <span className="text-sm text-muted-foreground">Analyzer</span>
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  )
}

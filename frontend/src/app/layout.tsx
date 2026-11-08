import type { Metadata } from "next"
import type { ReactNode } from "react"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"

import { cn } from "@/lib/utils"
import "../styles/globals.css"

export const metadata: Metadata = {
  title: "ABS Analyzer",
  description:
    "Analyze ABS asset pools for ESMA compliance, data quality, and portfolio health."
}

// Root layout is chrome-free: the (app) group owns the authenticated shell
// (nav + user menu) and the (auth) group owns the sign-in shell.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={cn(GeistSans.variable, GeistMono.variable, "dark")}>
      <body className="min-h-[100dvh] font-sans">{children}</body>
    </html>
  )
}

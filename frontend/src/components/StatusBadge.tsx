import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Severity-coded badge. Every tone maps onto the single locked palette: teal for
// good/low, amber for warning/medium/partial, red for error/high/failed, blue
// for info. Tints use the same hues, so the page keeps one accent system.
const statusBadge = cva(
  "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium",
  {
    variants: {
      tone: {
        success: "border-success/30 bg-success/15 text-success",
        partial: "border-warning/30 bg-warning/15 text-warning",
        failed: "border-destructive/30 bg-destructive/15 text-destructive",
        error: "border-destructive/30 bg-destructive/15 text-destructive",
        high: "border-destructive/30 bg-destructive/15 text-destructive",
        warning: "border-warning/30 bg-warning/15 text-warning",
        medium: "border-warning/30 bg-warning/15 text-warning",
        info: "border-info/30 bg-info/15 text-info",
        low: "border-info/30 bg-info/15 text-info"
      }
    },
    defaultVariants: { tone: "info" }
  }
)

export type Severity = NonNullable<VariantProps<typeof statusBadge>["tone"]>

export function StatusBadge({
  severity,
  children,
  className
}: {
  severity: Severity
  children: React.ReactNode
  className?: string
}) {
  return <span className={cn(statusBadge({ tone: severity }), className)}>{children}</span>
}

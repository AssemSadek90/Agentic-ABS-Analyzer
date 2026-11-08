// Display helpers. Rates/ratios arrive as decimal fractions and are multiplied
// by 100 for display (§4.2 unit convention).

export const formatPct = (fraction: number, digits = 2): string =>
  `${(fraction * 100).toFixed(digits)}%`

export const formatEur = (amount: number): string =>
  new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0
  }).format(amount)

export const formatMonths = (months: number): string => `${months.toFixed(1)} mo`

export const formatDateTime = (iso: string): string =>
  new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(iso))

export const formatRelative = (iso: string): string => {
  const diffMs = Date.now() - new Date(iso).getTime()
  const min = Math.round(diffMs / 60000)
  if (min < 1) return "just now"
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  const d = Math.round(hr / 24)
  if (d < 7) return `${d}d ago`
  return formatDateTime(iso)
}

// Small display helpers for exported documents (mirror the frontend's units:
// rates/ratios are decimal fractions, ×100 for display; EUR is absolute).

export const pct = (fraction: number | null): string =>
  fraction === null ? "N/A" : `${(fraction * 100).toFixed(2)}%`

export const eur = (amount: number): string =>
  new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0
  }).format(amount)

export const months = (m: number): string => `${m.toFixed(1)} mo`

export const dateTime = (iso: string): string =>
  new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso))

export const statusLabel = (status: string): string =>
  ({ success: "Success", partial: "Partial", failed: "Failed" })[status] ?? status

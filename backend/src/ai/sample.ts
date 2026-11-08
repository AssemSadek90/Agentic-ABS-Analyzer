import type { ValidatedAssetRow } from "../pipeline/schema"

// Pick a representative sample for large pools so token cost stays bounded
// (§4.5): delinquent/edge-case rows first, then largest exposures. Shared by
// every provider adapter.
export const pickSample = (rows: ValidatedAssetRow[], cap = 100): ValidatedAssetRow[] => {
  if (rows.length <= cap) return rows
  const byBalance = [...rows].sort((a, b) => b.outstanding_balance - a.outstanding_balance)
  const delinquent = rows.filter((r) => (r.days_past_due ?? 0) > 0)
  // De-duplicate while preserving "interesting" rows first.
  const seen = new Set<string>()
  const out: ValidatedAssetRow[] = []
  for (const r of [...delinquent, ...byBalance]) {
    if (out.length >= cap) break
    if (!seen.has(r.asset_id)) {
      seen.add(r.asset_id)
      out.push(r)
    }
  }
  return out
}

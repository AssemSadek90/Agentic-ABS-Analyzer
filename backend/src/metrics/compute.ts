import type { ValidatedAssetRow } from "../pipeline/schema"

export interface Breakdown {
  count: number
  volume: number // EUR
  pct: number // decimal fraction of total pool volume (0.72 == 72%)
}

export interface PoolMetrics {
  totalPoolVolume: number // EUR
  weightedAvgRate: number // decimal fraction (0.0482 == 4.82%)
  weightedAvgLtv: number | null // decimal fraction; null if no LTV data
  avgRemainingTenor: number // months
  delinquencyRate: number // decimal fraction
  concentrationTop5: number // decimal fraction
  // Single-obligor concentration (decimal fractions); null when no row carries
  // a borrower_id. Rows without one are treated as anonymous single exposures.
  obligorTop1: number | null
  obligorTop5: number | null
  assetTypeBreakdown: Record<string, Breakdown>
  countryBreakdown: Record<string, Breakdown>
}

const MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30.4375 // average month length

export const computeMetrics = (
  rows: ValidatedAssetRow[],
  now: Date = new Date()
): PoolMetrics => {
  const totalPoolVolume = rows.reduce((s, r) => s + r.outstanding_balance, 0)
  const safeTotal = totalPoolVolume === 0 ? 1 : totalPoolVolume // guard divide-by-zero

  // Outstanding-balance-weighted average interest rate.
  // interest_rate is a percentage in the source data (4.50 == 4.5%); we divide
  // by 100 exactly once, here, to produce a decimal fraction.
  const weightedAvgRate =
    rows.reduce((s, r) => s + r.outstanding_balance * (r.interest_rate / 100), 0) / safeTotal

  // Weighted average LTV over only the assets that actually report an LTV.
  const ltvRows = rows.filter((r) => r.loan_to_value !== null)
  const ltvWeight = ltvRows.reduce((s, r) => s + r.outstanding_balance, 0)
  const weightedAvgLtv =
    ltvRows.length === 0 || ltvWeight === 0
      ? null
      : ltvRows.reduce(
          (s, r) => s + r.outstanding_balance * ((r.loan_to_value as number) / 100),
          0
        ) / ltvWeight

  // Average remaining tenor in months (floored at 0 for already-matured assets).
  const avgRemainingTenor =
    rows.length === 0
      ? 0
      : rows.reduce((s, r) => {
          const months = (r.maturity_date.getTime() - now.getTime()) / MS_PER_MONTH
          return s + Math.max(0, months)
        }, 0) / rows.length

  // Delinquency: fraction of assets with days_past_due > 0 (null == not delinquent).
  const delinquentCount = rows.filter((r) => (r.days_past_due ?? 0) > 0).length
  const delinquencyRate = rows.length === 0 ? 0 : delinquentCount / rows.length

  // Concentration: share of total volume held by the 5 largest assets by balance.
  const top5Volume = [...rows]
    .sort((a, b) => b.outstanding_balance - a.outstanding_balance)
    .slice(0, 5)
    .reduce((s, r) => s + r.outstanding_balance, 0)
  const concentrationTop5 = top5Volume / safeTotal

  // Single-obligor concentration over rows that carry a borrower_id, as a share
  // of TOTAL pool volume (a lower bound when obligor data is partial).
  const obligorVolumes = new Map<string, number>()
  for (const r of rows) {
    if (r.borrower_id) {
      obligorVolumes.set(r.borrower_id, (obligorVolumes.get(r.borrower_id) ?? 0) + r.outstanding_balance)
    }
  }
  let obligorTop1: number | null = null
  let obligorTop5: number | null = null
  if (obligorVolumes.size > 0) {
    const sorted = [...obligorVolumes.values()].sort((a, b) => b - a)
    obligorTop1 = sorted[0] / safeTotal
    obligorTop5 = sorted.slice(0, 5).reduce((s, v) => s + v, 0) / safeTotal
  }

  // Group helper for the breakdowns.
  const groupBy = (key: (r: ValidatedAssetRow) => string): Record<string, Breakdown> => {
    const acc: Record<string, Breakdown> = {}
    for (const r of rows) {
      const k = key(r)
      if (!acc[k]) acc[k] = { count: 0, volume: 0, pct: 0 }
      acc[k].count += 1
      acc[k].volume += r.outstanding_balance
    }
    for (const k of Object.keys(acc)) acc[k].pct = acc[k].volume / safeTotal
    return acc
  }

  return {
    totalPoolVolume,
    weightedAvgRate,
    weightedAvgLtv,
    avgRemainingTenor,
    delinquencyRate,
    concentrationTop5,
    obligorTop1,
    obligorTop5,
    assetTypeBreakdown: groupBy((r) => r.asset_type),
    countryBreakdown: groupBy((r) => r.borrower_country)
  }
}

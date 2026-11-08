import type { PoolMetrics } from "../metrics/compute"
import type { ValidatedAssetRow } from "../pipeline/schema"
import type { RuleResultDTO } from "../types"
import { DEFAULT_THRESHOLDS, type RuleThresholds } from "./config"

// Deterministic ESMA compliance checks: a pure, side-effect-free function over
// the already-computed metrics and validated rows (mirrors metrics/compute.ts).
// The LLM never runs these — it only narrates on top of their outcomes. All
// observed/threshold values are DECIMAL FRACTIONS (the UI multiplies by 100).

const pct = (fraction: number): string => `${(fraction * 100).toFixed(2)}%`

const result = (
  ruleCode: string,
  severity: RuleResultDTO["severity"],
  passed: boolean,
  observedValue: number | null,
  thresholdValue: number | null,
  message: string
): RuleResultDTO => ({ ruleCode, severity, passed, observedValue, thresholdValue, message })

export const evaluateRules = (
  metrics: PoolMetrics,
  rows: ValidatedAssetRow[],
  thresholds: RuleThresholds = DEFAULT_THRESHOLDS
): RuleResultDTO[] => {
  const results: RuleResultDTO[] = []
  const rowCount = rows.length
  const safeVolume = metrics.totalPoolVolume === 0 ? 1 : metrics.totalPoolVolume
  const countShare = (predicate: (r: ValidatedAssetRow) => boolean): number =>
    rowCount === 0 ? 0 : rows.filter(predicate).length / rowCount

  // GEO_CONCENTRATION — largest single-country share of pool volume.
  {
    const entries = Object.entries(metrics.countryBreakdown)
    const [topCountry, top] = entries.reduce(
      (best, cur) => (cur[1].pct > best[1].pct ? cur : best),
      entries[0] ?? ["n/a", { count: 0, volume: 0, pct: 0 }]
    )
    const failed = top.pct > thresholds.geoConcentration
    results.push(
      result(
        "GEO_CONCENTRATION",
        "warning",
        !failed,
        top.pct,
        thresholds.geoConcentration,
        failed
          ? `Largest country exposure (${topCountry}) is ${pct(top.pct)} of pool volume, above the ${pct(thresholds.geoConcentration)} threshold`
          : `Largest country exposure (${topCountry}) is ${pct(top.pct)} of pool volume, within the ${pct(thresholds.geoConcentration)} threshold`
      )
    )
  }

  // SINGLE_EXPOSURE — largest single asset. Fails above the 5% line; between
  // 1% and 5% it passes but is surfaced as a notable info result.
  {
    const maxBalance = rows.reduce((max, r) => Math.max(max, r.outstanding_balance), 0)
    const share = maxBalance / safeVolume
    if (share > thresholds.singleExposureFail) {
      results.push(
        result(
          "SINGLE_EXPOSURE",
          "warning",
          false,
          share,
          thresholds.singleExposureFail,
          `Largest single exposure is ${pct(share)} of pool volume, above the ${pct(thresholds.singleExposureFail)} threshold`
        )
      )
    } else if (share > thresholds.singleExposureNotable) {
      results.push(
        result(
          "SINGLE_EXPOSURE",
          "info",
          true,
          share,
          thresholds.singleExposureFail,
          `Largest single exposure is ${pct(share)} of pool volume: notable (above ${pct(thresholds.singleExposureNotable)}) but within the ${pct(thresholds.singleExposureFail)} threshold`
        )
      )
    } else {
      results.push(
        result(
          "SINGLE_EXPOSURE",
          "info",
          true,
          share,
          thresholds.singleExposureFail,
          `Largest single exposure is ${pct(share)} of pool volume, within the ${pct(thresholds.singleExposureFail)} threshold`
        )
      )
    }
  }

  // TOP5_CONCENTRATION — share of volume in the 5 largest assets.
  {
    const failed = metrics.concentrationTop5 > thresholds.top5Concentration
    results.push(
      result(
        "TOP5_CONCENTRATION",
        "warning",
        !failed,
        metrics.concentrationTop5,
        thresholds.top5Concentration,
        `Top 5 assets hold ${pct(metrics.concentrationTop5)} of pool volume, ${failed ? "above" : "within"} the ${pct(thresholds.top5Concentration)} threshold`
      )
    )
  }

  // NPL_SHARE — assets more than 90 days past due (non-performing).
  {
    const share = countShare((r) => (r.days_past_due ?? 0) > 90)
    const failed = share > thresholds.nplShare
    results.push(
      result(
        "NPL_SHARE",
        "error",
        !failed,
        share,
        thresholds.nplShare,
        `${pct(share)} of assets are non-performing (DPD > 90), ${failed ? "above" : "within"} the ${pct(thresholds.nplShare)} threshold`
      )
    )
  }

  // EARLY_ARREARS_SHARE — assets more than 30 days past due (includes NPL).
  {
    const share = countShare((r) => (r.days_past_due ?? 0) > 30)
    const failed = share > thresholds.earlyArrearsShare
    results.push(
      result(
        "EARLY_ARREARS_SHARE",
        "warning",
        !failed,
        share,
        thresholds.earlyArrearsShare,
        `${pct(share)} of assets are more than 30 days past due, ${failed ? "above" : "within"} the ${pct(thresholds.earlyArrearsShare)} threshold`
      )
    )
  }

  // MISSING_CREDIT_SCORE — ESMA Article 7 disclosure completeness.
  {
    const share = countShare((r) => r.credit_score === null)
    const failed = share > thresholds.missingCreditScoreShare
    results.push(
      result(
        "MISSING_CREDIT_SCORE",
        "warning",
        !failed,
        share,
        thresholds.missingCreditScoreShare,
        `credit_score is missing on ${pct(share)} of assets, ${failed ? "above" : "within"} the ${pct(thresholds.missingCreditScoreShare)} disclosure threshold`
      )
    )
  }

  // MISSING_COLLATERAL — ESMA Article 7 disclosure completeness.
  {
    const share = countShare((r) => r.collateral_value === null)
    const failed = share > thresholds.missingCollateralShare
    results.push(
      result(
        "MISSING_COLLATERAL",
        "warning",
        !failed,
        share,
        thresholds.missingCollateralShare,
        `collateral_value is missing on ${pct(share)} of assets, ${failed ? "above" : "within"} the ${pct(thresholds.missingCollateralShare)} disclosure threshold`
      )
    )
  }

  // HIGH_LTV_SHARE — assets financed above their collateral value.
  {
    const share = countShare((r) => (r.loan_to_value ?? 0) > 100)
    const failed = share > thresholds.highLtvShare
    results.push(
      result(
        "HIGH_LTV_SHARE",
        "warning",
        !failed,
        share,
        thresholds.highLtvShare,
        `${pct(share)} of assets have an LTV above 100%, ${failed ? "above" : "within"} the ${pct(thresholds.highLtvShare)} threshold`
      )
    )
  }

  // OBLIGOR_CONCENTRATION — only evaluable when borrower_id data exists.
  if (metrics.obligorTop1 !== null) {
    const failed = metrics.obligorTop1 > thresholds.obligorConcentration
    results.push(
      result(
        "OBLIGOR_CONCENTRATION",
        "warning",
        !failed,
        metrics.obligorTop1,
        thresholds.obligorConcentration,
        `Largest single obligor holds ${pct(metrics.obligorTop1)} of pool volume, ${failed ? "above" : "within"} the ${pct(thresholds.obligorConcentration)} threshold`
      )
    )
  }

  return results
}

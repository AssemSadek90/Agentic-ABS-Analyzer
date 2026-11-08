// Deterministic ESMA-check thresholds, all decimal fractions (0.5 == 50%).
// One exported object so a future settings UI (backlog) has a single knob set.

export interface RuleThresholds {
  // share of pool volume in a single country
  geoConcentration: number
  // share of pool volume in a single asset: fail line + "notable" line
  singleExposureFail: number
  singleExposureNotable: number
  // share of pool volume in the 5 largest assets
  top5Concentration: number
  // share of assets (by count) with DPD > 90 (non-performing)
  nplShare: number
  // share of assets (by count) with DPD > 30 (early warning, includes NPL)
  earlyArrearsShare: number
  // share of rows missing the disclosure field
  missingCreditScoreShare: number
  missingCollateralShare: number
  // share of assets (by count) with LTV above 100%
  highLtvShare: number
  // share of pool volume held by the single largest obligor
  obligorConcentration: number
}

export const DEFAULT_THRESHOLDS: RuleThresholds = {
  geoConcentration: 0.5,
  singleExposureFail: 0.05,
  singleExposureNotable: 0.01,
  top5Concentration: 0.4,
  nplShare: 0.02,
  earlyArrearsShare: 0.1,
  missingCreditScoreShare: 0.1,
  missingCollateralShare: 0.1,
  highLtvShare: 0.05,
  obligorConcentration: 0.02
}

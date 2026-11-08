// Plain TypeScript types for the validation layer. We deliberately hand-roll
// validation (rather than using Effect's `Schema` module) so we can accumulate
// every error on a row in one pass; see validate.ts for the rationale.

// The raw shape coming from CSV parsing (all strings)
export interface RawAssetRow {
  asset_id?: string
  asset_type?: string
  origination_date?: string
  maturity_date?: string
  outstanding_balance?: string
  original_balance?: string
  interest_rate?: string
  borrower_country?: string
  credit_score?: string
  collateral_value?: string
  days_past_due?: string
  loan_to_value?: string
  borrower_id?: string // optional: enables single-obligor concentration
  [key: string]: string | undefined // allow extra columns
}

// The validated, typed shape after the pipeline
export interface ValidatedAssetRow {
  asset_id: string
  asset_type: string
  origination_date: Date
  maturity_date: Date
  outstanding_balance: number
  original_balance: number
  interest_rate: number
  borrower_country: string
  credit_score: number | null
  collateral_value: number | null
  days_past_due: number | null
  loan_to_value: number | null
  borrower_id: string | null // optional column; null when absent
}

// Typed error variants
export type ValidationErrorType =
  | { _tag: "MissingField"; field: string }
  | { _tag: "InvalidType"; field: string; rawValue: string; expectedType: string }
  | { _tag: "ConstraintViolation"; field: string; message: string }
  | { _tag: "DuplicateId"; assetId: string }

export interface RowValidationError {
  rowNumber: number
  assetId: string | null
  errors: ValidationErrorType[]
}

// All valid ISO 3166-1 alpha-2 country codes, used to validate borrower_country.
// The complete set of 249 officially-assigned codes is inlined here so the
// validation layer is fully self-contained and deterministic (no runtime
// dependency on i18n-iso-countries). "DEU" and other 3-letter / non-ISO inputs
// are therefore rejected.
export const ISO_3166_ALPHA2: ReadonlySet<string> = new Set([
  "AD","AE","AF","AG","AI","AL","AM","AO","AQ","AR","AS","AT","AU","AW","AX","AZ",
  "BA","BB","BD","BE","BF","BG","BH","BI","BJ","BL","BM","BN","BO","BQ","BR","BS",
  "BT","BV","BW","BY","BZ","CA","CC","CD","CF","CG","CH","CI","CK","CL","CM","CN",
  "CO","CR","CU","CV","CW","CX","CY","CZ","DE","DJ","DK","DM","DO","DZ","EC","EE",
  "EG","EH","ER","ES","ET","FI","FJ","FK","FM","FO","FR","GA","GB","GD","GE","GF",
  "GG","GH","GI","GL","GM","GN","GP","GQ","GR","GS","GT","GU","GW","GY","HK","HM",
  "HN","HR","HT","HU","ID","IE","IL","IM","IN","IO","IQ","IR","IS","IT","JE","JM",
  "JO","JP","KE","KG","KH","KI","KM","KN","KP","KR","KW","KY","KZ","LA","LB","LC",
  "LI","LK","LR","LS","LT","LU","LV","LY","MA","MC","MD","ME","MF","MG","MH","MK",
  "ML","MM","MN","MO","MP","MQ","MR","MS","MT","MU","MV","MW","MX","MY","MZ","NA",
  "NC","NE","NF","NG","NI","NL","NO","NP","NR","NU","NZ","OM","PA","PE","PF","PG",
  "PH","PK","PL","PM","PN","PR","PS","PT","PW","PY","QA","RE","RO","RS","RU","RW",
  "SA","SB","SC","SD","SE","SG","SH","SI","SJ","SK","SL","SM","SN","SO","SR","SS",
  "ST","SV","SX","SY","SZ","TC","TD","TF","TG","TH","TJ","TK","TL","TM","TN","TO",
  "TR","TT","TV","TW","TZ","UA","UG","UM","US","UY","UZ","VA","VC","VE","VG","VI",
  "VN","VU","WF","WS","YE","YT","ZA","ZM","ZW"
])

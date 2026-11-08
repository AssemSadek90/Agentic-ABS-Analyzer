import { Effect } from "effect"
import { ISO_3166_ALPHA2 } from "./schema"
import type { RawAssetRow, ValidatedAssetRow, RowValidationError, ValidationErrorType } from "./schema"

// Field keys of RawAssetRow, narrowed to string. (The string index signature on
// RawAssetRow widens `keyof` to `string | number`; intersecting with `string`
// keeps the helpers strict-mode clean when pushing `field` into the error union.)
type RawField = keyof RawAssetRow & string

// Locale-aware numeric parser. European exports frequently use a decimal comma
// ("1234,56") and/or thousands separators. Heuristic:
//   - if the value contains both "," and "." → the separator that appears LAST
//     is the decimal point ("1.234,56" is German style, so swap; "1,234.56" is
//     US style, so strip commas)
//   - if it contains only "," → treat "," as the decimal point
//   - otherwise parse as-is
// Returns NaN for anything genuinely non-numeric so callers can flag it.
const parseNumeric = (input: string): number => {
  let s = input.replace(/\s|€/g, "")
  const hasComma = s.includes(",")
  const hasDot = s.includes(".")
  if (hasComma && hasDot) {
    // The separator that appears LAST is the decimal separator.
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.replace(/\./g, "").replace(",", ".") // German: 1.234,56 → 1234.56
    } else {
      s = s.replace(/,/g, "") // US: 1,234.56 → 1234.56
    }
  } else if (hasComma) {
    s = s.replace(",", ".") // 1234,56 → 1234.56
  }
  return Number(s)
}

// Validate a single row — returns Effect that succeeds with ValidatedAssetRow
// or fails with RowValidationError
const validateRow = (
  raw: RawAssetRow,
  rowNumber: number
): Effect.Effect<ValidatedAssetRow, RowValidationError> => {
  const errors: ValidationErrorType[] = []

  // Helper: require a field to be present and non-empty
  const requireString = (field: RawField): string | null => {
    const val = raw[field]?.trim()
    if (!val) {
      errors.push({ _tag: "MissingField", field })
      return null
    }
    return val
  }

  // Helper: parse a number field
  const requireNumber = (field: RawField): number | null => {
    const raw_val = raw[field]?.trim()
    if (!raw_val) {
      errors.push({ _tag: "MissingField", field })
      return null
    }
    const parsed = parseNumeric(raw_val)
    if (isNaN(parsed)) {
      errors.push({ _tag: "InvalidType", field, rawValue: raw_val, expectedType: "number" })
      return null
    }
    return parsed
  }

  // Helper: parse optional number
  const optionalNumber = (field: RawField): number | null => {
    const raw_val = raw[field]?.trim()
    if (!raw_val) return null
    const parsed = parseNumeric(raw_val)
    if (isNaN(parsed)) {
      errors.push({ _tag: "InvalidType", field, rawValue: raw_val, expectedType: "number" })
      return null
    }
    return parsed
  }

  // Required fields
  const asset_id = requireString("asset_id")
  const asset_type = requireString("asset_type")
  const origination_raw = requireString("origination_date")
  const maturity_raw = requireString("maturity_date")
  const outstanding_balance = requireNumber("outstanding_balance")
  const original_balance = requireNumber("original_balance")
  const interest_rate = requireNumber("interest_rate")
  const borrower_country = requireString("borrower_country")

  // Optional fields
  const credit_score = optionalNumber("credit_score")
  const collateral_value = optionalNumber("collateral_value")
  const days_past_due = optionalNumber("days_past_due")
  const loan_to_value = optionalNumber("loan_to_value")
  // Optional free-form obligor identifier (no constraint beyond presence).
  const borrower_id = raw.borrower_id?.trim() || null

  // Date parsing
  let origination_date: Date | null = null
  let maturity_date: Date | null = null
  if (origination_raw) {
    const d = new Date(origination_raw)
    if (isNaN(d.getTime())) {
      errors.push({ _tag: "InvalidType", field: "origination_date", rawValue: origination_raw, expectedType: "ISO date" })
    } else {
      origination_date = d
    }
  }
  if (maturity_raw) {
    const d = new Date(maturity_raw)
    if (isNaN(d.getTime())) {
      errors.push({ _tag: "InvalidType", field: "maturity_date", rawValue: maturity_raw, expectedType: "ISO date" })
    } else {
      maturity_date = d
    }
  }

  // Cross-field constraints (only check if both fields parsed successfully)
  if (origination_date && maturity_date && origination_date >= maturity_date) {
    errors.push({
      _tag: "ConstraintViolation",
      field: "maturity_date",
      message: "maturity_date must be after origination_date"
    })
  }
  if (outstanding_balance !== null && original_balance !== null && outstanding_balance > original_balance) {
    errors.push({
      _tag: "ConstraintViolation",
      field: "outstanding_balance",
      message: "outstanding_balance cannot exceed original_balance"
    })
  }
  if (interest_rate !== null && (interest_rate < 0 || interest_rate > 100)) {
    errors.push({
      _tag: "ConstraintViolation",
      field: "interest_rate",
      message: "interest_rate must be between 0 and 100"
    })
  }
  if (days_past_due !== null && days_past_due < 0) {
    errors.push({
      _tag: "ConstraintViolation",
      field: "days_past_due",
      message: "days_past_due must be >= 0"
    })
  }
  if (loan_to_value !== null && (loan_to_value < 0 || loan_to_value > 200)) {
    errors.push({
      _tag: "ConstraintViolation",
      field: "loan_to_value",
      message: "loan_to_value must be between 0 and 200"
    })
  }

  // ISO 3166-1 alpha-2 country code check.
  // Normalize to uppercase first (so "de" is accepted), then verify it is an
  // actual ISO code, not merely two letters (rejects "XX", "ZZ", etc.).
  // ISO_3166_ALPHA2 is a Set<string> of all valid codes, defined in schema.ts.
  let normalized_country: string | null = null
  if (borrower_country) {
    const up = borrower_country.toUpperCase()
    if (!ISO_3166_ALPHA2.has(up)) {
      errors.push({
        _tag: "ConstraintViolation",
        field: "borrower_country",
        message: "borrower_country must be a valid ISO 3166-1 alpha-2 code (e.g. DE, FR, NL)"
      })
    } else {
      normalized_country = up
    }
  }

  // If any errors accumulated, fail with all of them
  if (errors.length > 0) {
    return Effect.fail({
      rowNumber,
      assetId: asset_id,
      errors
    } satisfies RowValidationError)
  }

  // All required fields are present and valid
  return Effect.succeed({
    asset_id: asset_id!,
    asset_type: asset_type!,
    origination_date: origination_date!,
    maturity_date: maturity_date!,
    outstanding_balance: outstanding_balance!,
    original_balance: original_balance!,
    interest_rate: interest_rate!,
    borrower_country: normalized_country!,
    credit_score,
    collateral_value,
    days_past_due,
    loan_to_value,
    borrower_id
  } satisfies ValidatedAssetRow)
}

// Validate all rows, collecting both successes and failures.
// Does NOT short-circuit — every row is validated.
export const validateRows = (
  rawRows: RawAssetRow[]
): Effect.Effect<{
  validRows: ValidatedAssetRow[]
  errors: RowValidationError[]
}> => {
  // Run all row validations, catching failures into Either. We tag each result
  // with its original 1-indexed CSV row number so that the duplicate check below
  // can report the true line — the success value (ValidatedAssetRow) does not
  // carry a row number on its own.
  const results = rawRows.map((row, index) => {
    const rowNumber = index + 1
    return Effect.either(validateRow(row, rowNumber)).pipe(
      Effect.map((either) => ({ either, rowNumber }))
    )
  })

  return Effect.all(results).pipe(
    Effect.map((tagged) => {
      const validRows: ValidatedAssetRow[] = []
      const errors: RowValidationError[] = []

      // Track the FIRST CSV row number on which each asset_id was seen.
      const firstSeenRow = new Map<string, number>()

      for (const { either, rowNumber } of tagged) {
        if (either._tag === "Right") {
          const row = either.right
          if (firstSeenRow.has(row.asset_id)) {
            // Report the duplicate against its own CSV line, and reference the
            // first occurrence in the message for a clear, actionable error.
            errors.push({
              rowNumber,
              assetId: row.asset_id,
              errors: [{ _tag: "DuplicateId", assetId: row.asset_id }]
            })
          } else {
            firstSeenRow.set(row.asset_id, rowNumber)
            validRows.push(row)
          }
        } else {
          errors.push(either.left)
        }
      }

      return { validRows, errors }
    })
  )
}

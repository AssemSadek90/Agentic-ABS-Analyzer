-- migrations/001_init.sql

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- One row per analysis run
CREATE TABLE analysis_runs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  filename        TEXT,                          -- original uploaded filename
  row_count       INTEGER NOT NULL,              -- total rows in CSV
  valid_row_count INTEGER NOT NULL,              -- rows that passed validation
  status          TEXT NOT NULL                  -- 'success' | 'partial' | 'failed'
                  CHECK (status IN ('success', 'partial', 'failed')),
  raw_csv         TEXT NOT NULL                  -- full raw CSV content stored for audit
);

-- Validation errors found in the pipeline (one row per error)
CREATE TABLE validation_errors (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id          UUID NOT NULL REFERENCES analysis_runs(id) ON DELETE CASCADE,
  row_number      INTEGER NOT NULL,              -- 1-indexed row number in CSV
  asset_id        TEXT,                          -- if parseable
  field           TEXT NOT NULL,                 -- which column failed
  error_type      TEXT NOT NULL,                 -- 'missing' | 'invalid_type' | 'constraint_violation' | 'duplicate'
  message         TEXT NOT NULL                  -- human-readable description
);

-- The analysis result: code-computed metrics + the LLM's qualitative output
CREATE TABLE analysis_results (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id                UUID NOT NULL UNIQUE REFERENCES analysis_runs(id) ON DELETE CASCADE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Pool-level metrics (computed deterministically in code — see metrics/compute.ts)
  -- Rates/ratios are stored as decimal fractions (0.0482 == 4.82%).
  total_pool_volume     NUMERIC(18, 2),          -- sum of outstanding balances (EUR)
  weighted_avg_rate     NUMERIC(6, 4),           -- weighted avg interest rate (decimal fraction)
  weighted_avg_ltv      NUMERIC(6, 4),           -- weighted avg LTV (decimal fraction)
  avg_remaining_tenor   NUMERIC(8, 2),           -- in months
  delinquency_rate      NUMERIC(6, 4),           -- fraction of assets with DPD > 0 (decimal)
  concentration_top5    NUMERIC(6, 4),           -- fraction of pool in top 5 assets by balance (decimal)

  -- Asset type breakdown stored as JSONB (computed in code; pct is a decimal fraction)
  asset_type_breakdown  JSONB,
  -- Example: {"bike": {"count": 1200, "volume": 18000000, "pct": 0.72}, ...}

  -- Country breakdown stored as JSONB (computed in code; pct is a decimal fraction)
  country_breakdown     JSONB,
  -- Example: {"DE": {"count": 900, "volume": 14000000, "pct": 0.54}, ...}

  -- ESMA compliance flags array (from the LLM)
  esma_flags            JSONB,
  -- Example: [{"code": "ESMA-FIELD-MISSING", "severity": "warning", "message": "...", "affected_rows": 12}]

  -- Risk signals (from the LLM)
  risk_signals          JSONB,
  -- Example: [{"type": "concentration_risk", "severity": "high", "description": "...", "recommendation": "..."}]

  -- Plain-language summary (from the LLM)
  executive_summary     TEXT NOT NULL,

  -- Raw tool call response from Claude (for debugging)
  raw_ai_response       JSONB NOT NULL
);

-- Indexes for common query patterns
CREATE INDEX idx_analysis_runs_created_at ON analysis_runs(created_at DESC);
CREATE INDEX idx_validation_errors_run_id ON validation_errors(run_id);
CREATE INDEX idx_analysis_results_run_id ON analysis_results(run_id);

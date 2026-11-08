-- migrations/005_rules.sql (Phase 2, Chunk 7)

CREATE TABLE rule_results (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id          UUID NOT NULL REFERENCES analysis_runs(id) ON DELETE CASCADE,
  rule_code       TEXT NOT NULL,
  severity        TEXT NOT NULL CHECK (severity IN ('error','warning','info')),
  passed          BOOLEAN NOT NULL,
  observed_value  NUMERIC,                     -- decimal fraction where applicable
  threshold_value NUMERIC,
  message         TEXT NOT NULL
);

CREATE INDEX idx_rule_results_run ON rule_results(run_id);

-- True single-obligor concentration (requires the optional borrower_id column).
ALTER TABLE analysis_results ADD COLUMN obligor_top1 NUMERIC(6,4);  -- NULL when no borrower_id data
ALTER TABLE analysis_results ADD COLUMN obligor_top5 NUMERIC(6,4);

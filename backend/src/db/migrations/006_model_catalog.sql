-- 006_model_catalog.sql — dynamic LLM model catalog (last-known-good).
-- A single row holding the curated picker catalog built from the providers'
-- List Models APIs + models.dev. Refreshed daily (Vercel Cron) and lazily when
-- stale; read by GET /api/models and by the provider/model selection check.

CREATE TABLE IF NOT EXISTS model_catalog (
  id           SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  catalog      JSONB NOT NULL,
  refreshed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

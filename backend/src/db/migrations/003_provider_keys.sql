-- migrations/003_provider_keys.sql (Phase 2, Chunk 3)

CREATE TABLE provider_keys (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider      TEXT NOT NULL CHECK (provider IN ('anthropic','openai','gemini')),
  encrypted_key TEXT NOT NULL,                 -- "<iv_hex>:<ciphertext_hex>:<authtag_hex>", AES-256-GCM
  key_last4     TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, provider)
);

-- Which LLM produced the qualitative layer of a run.
ALTER TABLE analysis_results ADD COLUMN provider TEXT;
ALTER TABLE analysis_results ADD COLUMN model TEXT;

-- migrations/002_auth.sql (Phase 2, Chunk 1)

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         TEXT NOT NULL UNIQUE,          -- stored lowercased
  password_hash TEXT NOT NULL,                 -- argon2id
  display_name  TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sessions (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,             -- sha256 hex of the opaque cookie token
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- NULL user_id = legacy pre-auth rows; they are invisible to every user
-- (all queries filter on user_id).
ALTER TABLE analysis_runs ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE CASCADE;

CREATE INDEX idx_analysis_runs_user ON analysis_runs(user_id, created_at DESC);
CREATE INDEX idx_sessions_user ON sessions(user_id);

-- migrations/004_chat.sql (Phase 2, Chunk 5)

CREATE TABLE chat_conversations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL DEFAULT 'New conversation',
  attached_run_id UUID REFERENCES analysis_runs(id) ON DELETE SET NULL,  -- the ONE run in context
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE chat_messages (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content         TEXT NOT NULL,
  attached_run_id UUID REFERENCES analysis_runs(id) ON DELETE SET NULL,  -- context switch marker
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chat_messages_conv ON chat_messages(conversation_id, created_at);
CREATE INDEX idx_chat_conversations_user ON chat_conversations(user_id, updated_at DESC);

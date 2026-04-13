-- AnthologyFramework initial schema
-- All tables use the anthologyframework_ prefix and are independent of
-- the existing anthology_* schema.

-- pgvector is required for narrative and response embedding columns.
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- Workflow definitions
-- ============================================================
-- The JSON pipeline spec: which steps, in what order, with what
-- dependencies. Stored as JSONB so it can be edited via API at
-- runtime without a schema migration.
CREATE TABLE public.anthologyframework_workflows (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  description TEXT,
  definition  JSONB NOT NULL,
  version     INTEGER NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Anthologies
-- ============================================================
-- A project (collection) that runs one workflow.  workflow_id is
-- set by POST /api/anthologies/:anthologyId/workflow.
CREATE TABLE public.anthologyframework_anthologies (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID REFERENCES public.anthologyframework_workflows(id),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  description TEXT,
  metadata    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Recordings
-- ============================================================
-- Audio files uploaded via the upload-file step.
CREATE TABLE public.anthologyframework_recordings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anthology_id    UUID NOT NULL REFERENCES public.anthologyframework_anthologies(id) ON DELETE CASCADE,
  file_path       TEXT NOT NULL,
  file_name       TEXT NOT NULL,
  file_size_bytes BIGINT,
  mime_type       TEXT,
  duration_ms     INTEGER,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Step states
-- ============================================================
-- Per-anthology, per-step execution state.  This is the single
-- source of truth for step progress — no status fields on other
-- tables.  One row per (anthology_id, step_id); created with
-- status = 'pending' when a workflow is associated with an
-- anthology, so progress is always complete.
CREATE TABLE public.anthologyframework_step_states (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anthology_id  UUID NOT NULL REFERENCES public.anthologyframework_anthologies(id) ON DELETE CASCADE,
  workflow_id   UUID NOT NULL REFERENCES public.anthologyframework_workflows(id),
  step_id       TEXT NOT NULL,
  -- pending | processing | completed | error
  status        TEXT NOT NULL DEFAULT 'pending',
  -- opaque state passed between ticks; belongs entirely to the step
  tick_state    JSONB,
  -- Supabase Storage path to the completed step's primary output artifact
  output_path   TEXT,
  progress      FLOAT,
  error         TEXT,
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  UNIQUE (anthology_id, step_id)
);

-- ============================================================
-- Conversations
-- ============================================================
-- Created by the create-conversation step.  One per recording.
CREATE TABLE public.anthologyframework_conversations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anthology_id UUID NOT NULL REFERENCES public.anthologyframework_anthologies(id) ON DELETE CASCADE,
  recording_id UUID REFERENCES public.anthologyframework_recordings(id),
  metadata     JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Speakers
-- ============================================================
-- Identified by the identify-speakers step; resolved to named
-- individuals by create-conversation.
CREATE TABLE public.anthologyframework_speakers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anthology_id    UUID NOT NULL REFERENCES public.anthologyframework_anthologies(id),
  conversation_id UUID NOT NULL REFERENCES public.anthologyframework_conversations(id),
  speaker_label   TEXT NOT NULL,   -- AssemblyAI label, e.g. "A", "B"
  name            TEXT NOT NULL,   -- human-readable name from LLM inference
  color           TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}'
);

-- ============================================================
-- Questions
-- ============================================================
-- Added via add-questions step (one call per question).
CREATE TABLE public.anthologyframework_questions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anthology_id    UUID NOT NULL REFERENCES public.anthologyframework_anthologies(id),
  conversation_id UUID NOT NULL REFERENCES public.anthologyframework_conversations(id),
  question_text   TEXT NOT NULL,
  facilitator     TEXT,
  notes           TEXT,
  audio_start_ms  INTEGER,
  audio_end_ms    INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Narratives
-- ============================================================
-- Added via add-narratives step.  embedding populated by
-- create-conversation using OpenAI text-embedding-3-small.
CREATE TABLE public.anthologyframework_narratives (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anthology_id    UUID NOT NULL REFERENCES public.anthologyframework_anthologies(id),
  conversation_id UUID NOT NULL REFERENCES public.anthologyframework_conversations(id),
  narrative_text  TEXT NOT NULL,
  notes           TEXT,
  embedding       vector(1536),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Responses
-- ============================================================
-- One row per filtered speaker turn, produced by create-responses.
-- embedding: OpenAI text-embedding-3-small on speaker_text.
-- legacy_id: deterministic ID used for upsert idempotency.
-- chronological_turn_number: set by set-chronological-order step.
CREATE TABLE public.anthologyframework_responses (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anthology_id              UUID NOT NULL REFERENCES public.anthologyframework_anthologies(id),
  conversation_id           UUID NOT NULL REFERENCES public.anthologyframework_conversations(id),
  speaker_id                UUID REFERENCES public.anthologyframework_speakers(id),
  question_id               UUID REFERENCES public.anthologyframework_questions(id),
  narrative_id              UUID REFERENCES public.anthologyframework_narratives(id),
  speaker_text              TEXT NOT NULL,
  audio_start_ms            INTEGER,
  audio_end_ms              INTEGER,
  turn_number               INTEGER,
  chronological_turn_number INTEGER,
  standalone_score          FLOAT,
  direct_answer_score       FLOAT,
  embedding                 vector(1536),
  legacy_id                 TEXT UNIQUE,
  metadata                  JSONB NOT NULL DEFAULT '{}',
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Indexes
-- ============================================================

-- Step state lookups are always by anthology + step
CREATE INDEX idx_step_states_anthology ON public.anthologyframework_step_states (anthology_id);
CREATE INDEX idx_step_states_anthology_step ON public.anthologyframework_step_states (anthology_id, step_id);

-- Recording lookups by anthology
CREATE INDEX idx_recordings_anthology ON public.anthologyframework_recordings (anthology_id);

-- Conversation lookups
CREATE INDEX idx_conversations_anthology ON public.anthologyframework_conversations (anthology_id);
CREATE INDEX idx_conversations_recording ON public.anthologyframework_conversations (recording_id);

-- Response lookups
CREATE INDEX idx_responses_anthology ON public.anthologyframework_responses (anthology_id);
CREATE INDEX idx_responses_conversation ON public.anthologyframework_responses (conversation_id);
CREATE INDEX idx_responses_speaker ON public.anthologyframework_responses (speaker_id);
CREATE INDEX idx_responses_question ON public.anthologyframework_responses (question_id);
CREATE INDEX idx_responses_narrative ON public.anthologyframework_responses (narrative_id);

-- Vector similarity search on narratives and responses
CREATE INDEX idx_narratives_embedding ON public.anthologyframework_narratives
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX idx_responses_embedding ON public.anthologyframework_responses
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ============================================================
-- updated_at trigger helper
-- ============================================================

CREATE OR REPLACE FUNCTION public.anthologyframework_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_workflows_updated_at
  BEFORE UPDATE ON public.anthologyframework_workflows
  FOR EACH ROW EXECUTE FUNCTION public.anthologyframework_set_updated_at();

CREATE TRIGGER trg_anthologies_updated_at
  BEFORE UPDATE ON public.anthologyframework_anthologies
  FOR EACH ROW EXECUTE FUNCTION public.anthologyframework_set_updated_at();

-- ============================================================
-- Storage bucket
-- ============================================================
-- Run this separately in the Supabase dashboard or via the
-- Supabase CLI if the bucket does not already exist:
--
--   INSERT INTO storage.buckets (id, name, public)
--   VALUES ('anthologyframework-artifacts', 'anthologyframework-artifacts', false)
--   ON CONFLICT (id) DO NOTHING;
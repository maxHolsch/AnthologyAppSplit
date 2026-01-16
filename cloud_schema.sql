-- =============================================================================
-- ANTHOLOGY DATABASE SCHEMA DOCUMENTATION
-- =============================================================================
-- 
-- This file documents the complete database schema for the Anthology platform.
-- Anthology is an interactive visualization platform for exploring conversations
-- through a graph-based interface with audio playback capabilities.
-- 
-- All tables are prefixed with `anthology_` and support Row Level Security (RLS).
-- 
-- 
-- =============================================================================


-- =============================================================================
-- ENTITY RELATIONSHIPS OVERVIEW
-- =============================================================================
-- 
-- The database follows a hierarchical structure with anthology at the top:
-- 
--   ┌─────────────────────────────────────────────────────────────────────────┐
--   │                           ANTHOLOGIES                                   │
--   │                     (top-level collection)                              │
--   └───────────────────────────────┬─────────────────────────────────────────┘
--                                   │
--          ┌───────────────────────┬┴────────────────────┬───────────────────┐
--          │                       │                     │                   │
--          ▼                       ▼                     ▼                   ▼
--   ┌─────────────┐        ┌─────────────┐       ┌─────────────┐     ┌─────────────┐
--   │CONVERSATIONS│        │  RECORDINGS │       │  SPEAKERS   │     │SENSEMAKING  │
--   │             │        │   (audio)   │       │  (colors)   │     │    JOBS     │
--   └──────┬──────┘        └──────┬──────┘       └──────┬──────┘     └─────────────┘
--          │                      │                     │
--          │    ┌─────────────────┤                     │
--          │    │                 │                     │
--          ▼    ▼                 │                     │
--   ┌─────────────┐               │                     │
--   │  QUESTIONS  │◄──────────────┤                     │
--   │  (prompts)  │               │                     │
--   └──────┬──────┘               │                     │
--          │                      │                     │
--          ▼                      │                     │
--   ┌─────────────┐               │                     │
--   │ NARRATIVES  │               │                     │
--   │  (stories)  │               │                     │
--   └──────┬──────┘               │                     │
--          │                      │                     │
--          └──────────┬───────────┘                     │
--                     │                                 │
--                     ▼                                 │
--              ┌─────────────┐                          │
--              │  RESPONSES  │◄─────────────────────────┘
--              │  (answers)  │
--              └──────┬──────┘
--                     │
--                     ▼
--              ┌─────────────┐
--              │    WORD     │
--              │ TIMESTAMPS  │
--              └─────────────┘
-- 
-- 
-- HOW THE TABLES CONNECT:
-- 
-- 1. ANTHOLOGY (anthology_anthologies)
--    The root container. Everything belongs to an anthology via anthology_id.
--    Think of it as a project or dataset that groups related conversations.
-- 
-- 2. CONVERSATIONS (anthology_conversations)
--    A single discussion session within an anthology. Has a title, date, 
--    location, and color for visualization. All questions and responses
--    belong to a conversation.
-- 
-- 3. RECORDINGS (anthology_recordings)
--    Audio files stored in Supabase Storage. Can be linked to:
--    - Conversations (via anthology_conversation_recordings junction table)
--    - Individual questions or responses (for per-node audio playback)
-- 
-- 4. SPEAKERS (anthology_speakers)
--    Participants in conversations with assigned color schemes. The colors
--    determine how response nodes appear in the visualization (circle color,
--    quote box color, text color - both active and faded states).
-- 
-- 5. QUESTIONS (anthology_questions)
--    Prompt nodes in the graph visualization. Questions are asked by
--    facilitators and receive responses from speakers. Can optionally
--    have audio from a recording with start/end timestamps.
-- 
-- 6. NARRATIVES (anthology_narratives)
--    Similar to questions but for storytelling prompts (no question mark).
--    Used to prompt stories and reflections. Support semantic embeddings
--    for UMAP-based layout positioning.
-- 
-- 7. RESPONSES (anthology_responses)
--    The core content nodes. Each response:
--    - Belongs to a conversation and anthology
--    - Can respond to a question, another response, OR a narrative
--    - Has a speaker (with colors) and speaker_text (transcript)
--    - Can have an optional pull_quote for featured display
--    - Has optional audio reference with timestamps
--    - Has embedding vector for semantic positioning via UMAP
-- 
-- 8. WORD_TIMESTAMPS (anthology_word_timestamps)
--    Fine-grained timing data for karaoke-style highlighting. Each word
--    in a response or question gets start/end milliseconds for synchronized
--    playback. Generated by AssemblyAI during transcription.
-- 
-- 9. SENSEMAKING_JOBS (anthology_sensemaking_jobs)
--    Async job queue for the AI processing pipeline. Tracks progress as
--    audio files are transcribed, speaker-diarized, matched to questions,
--    and uploaded as nodes.
-- 
-- =============================================================================

-- -----------------------------------------------------------------------------
-- EXTENSIONS
-- -----------------------------------------------------------------------------
-- Required PostgreSQL extensions for Anthology functionality

-- UUID generation for primary keys
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";

-- Vector embeddings for semantic search and UMAP layout
-- Uses OpenAI text-embedding-3-small (1536 dimensions)
CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA "public";


-- =============================================================================
-- UTILITY FUNCTIONS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- anthology_update_updated_at_column()
-- -----------------------------------------------------------------------------
-- Trigger function to automatically update the updated_at timestamp
-- whenever a row is modified. Applied to all main tables.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."anthology_update_updated_at_column"() 
RETURNS "trigger"
LANGUAGE "plpgsql"
AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- =============================================================================
-- CORE TABLES
-- =============================================================================

-- -----------------------------------------------------------------------------
-- anthology_anthologies
-- -----------------------------------------------------------------------------
-- Top-level dataset partition representing a collection of conversations.
-- Each anthology has a unique URL-friendly slug for routing.
-- 
-- Relationships:
--   - Has many: conversations, questions, responses, recordings, speakers, narratives
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."anthology_anthologies" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "slug" "text" NOT NULL,                              -- URL-friendly identifier (unique)
    "title" "text" NOT NULL,                             -- Display name
    "description" "text",                                -- Optional description
    "is_public" boolean DEFAULT true NOT NULL,           -- Visibility flag
    "metadata" "jsonb" DEFAULT '{}'::jsonb NOT NULL,     -- Extensible metadata
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    
    PRIMARY KEY ("id"),
    UNIQUE ("slug")
);

COMMENT ON TABLE "public"."anthology_anthologies" IS 
'Top-level dataset partition (collection of conversations).';


-- -----------------------------------------------------------------------------
-- anthology_conversations
-- -----------------------------------------------------------------------------
-- Discussion sessions containing questions and responses.
-- Each conversation belongs to a single anthology and has a distinct color
-- for visualization purposes.
-- 
-- Relationships:
--   - Belongs to: anthology
--   - Has many: questions, responses, speakers, recordings (via junction)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."anthology_conversations" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "anthology_id" "uuid" NOT NULL,                      -- FK to anthologies
    "legacy_id" "text",                                  -- For JSON import compatibility
    "title" "text" NOT NULL,                             -- Conversation title
    "date" "date",                                       -- When the conversation occurred
    "location" "text",                                   -- Where it took place
    "facilitator" "text",                                -- Who facilitated
    "color" "text" DEFAULT '#4A90E2'::"text",           -- Hex color for visualization
    "topics" "text"[],                                   -- Topic tags
    "participants" "text"[],                             -- Participant names
    "source_transcript" "text",                          -- Original transcript source
    "notes" "text",                                      -- Additional notes
    "metadata" "jsonb" DEFAULT '{}'::jsonb,              -- Extensible metadata
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    
    PRIMARY KEY ("id"),
    UNIQUE ("anthology_id", "legacy_id"),
    CONSTRAINT "valid_color" CHECK (("color" ~ '^#[0-9A-Fa-f]{6}$'::"text")),
    FOREIGN KEY ("anthology_id") REFERENCES "public"."anthology_anthologies"("id") ON DELETE RESTRICT
);

COMMENT ON TABLE "public"."anthology_conversations" IS 
'Discussion sessions containing questions and responses.';


-- -----------------------------------------------------------------------------
-- anthology_recordings
-- -----------------------------------------------------------------------------
-- Audio files that can be linked to conversations or individual nodes.
-- Stored in Supabase Storage with metadata for playback.
-- 
-- Relationships:
--   - Belongs to: anthology (optional)
--   - Referenced by: questions, responses, conversation_recordings (junction)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."anthology_recordings" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "anthology_id" "uuid",                               -- FK to anthologies (nullable)
    "file_path" "text" NOT NULL,                         -- Supabase Storage URL
    "file_name" "text" NOT NULL,                         -- Original filename
    "file_size_bytes" bigint,                            -- File size in bytes
    "mime_type" "text" DEFAULT 'audio/mpeg'::"text",    -- Audio MIME type
    "duration_ms" integer NOT NULL,                      -- Duration in milliseconds
    "sample_rate" integer,                               -- Audio sample rate
    "bit_rate" integer,                                  -- Audio bit rate
    "metadata" "jsonb" DEFAULT '{}'::jsonb,              -- Extensible metadata
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    
    PRIMARY KEY ("id"),
    CONSTRAINT "positive_duration" CHECK (("duration_ms" > 0)),
    FOREIGN KEY ("anthology_id") REFERENCES "public"."anthology_anthologies"("id") ON DELETE SET NULL
);

COMMENT ON TABLE "public"."anthology_recordings" IS 
'Audio files that can be linked to conversations or individual nodes.';


-- -----------------------------------------------------------------------------
-- anthology_conversation_recordings
-- -----------------------------------------------------------------------------
-- Many-to-many junction table between conversations and recordings.
-- Allows a conversation to have multiple audio files and vice versa.
-- 
-- Relationships:
--   - Belongs to: conversation, recording
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."anthology_conversation_recordings" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,                   -- FK to conversations
    "recording_id" "uuid" NOT NULL,                      -- FK to recordings
    "is_primary" boolean DEFAULT false,                  -- Primary recording flag
    "recording_order" integer,                           -- Order for multiple recordings
    "created_at" timestamp with time zone DEFAULT "now"(),
    
    PRIMARY KEY ("id"),
    UNIQUE ("conversation_id", "recording_id"),
    FOREIGN KEY ("conversation_id") REFERENCES "public"."anthology_conversations"("id") ON DELETE CASCADE,
    FOREIGN KEY ("recording_id") REFERENCES "public"."anthology_recordings"("id") ON DELETE CASCADE
);

COMMENT ON TABLE "public"."anthology_conversation_recordings" IS 
'Many-to-many relationship between conversations and recordings.';


-- -----------------------------------------------------------------------------
-- anthology_speakers
-- -----------------------------------------------------------------------------
-- Participants with visual color assignments per conversation.
-- Each speaker has a complete color scheme for visualization states.
-- 
-- Color scheme includes:
--   - circle_color: Node circle fill (active state)
--   - faded_circle_color: Node circle fill (inactive state)
--   - quote_rectangle_color: Pull quote box background
--   - quote_text_color: Pull quote text color
-- 
-- Relationships:
--   - Belongs to: anthology, conversation (optional)
--   - Has many: responses
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."anthology_speakers" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "anthology_id" "uuid" NOT NULL,                      -- FK to anthologies
    "conversation_id" "uuid",                            -- FK to conversations (optional)
    "name" "text" NOT NULL,                              -- Speaker display name
    "circle_color" "text" NOT NULL,                      -- Active node color
    "faded_circle_color" "text" NOT NULL,               -- Inactive node color
    "quote_rectangle_color" "text" NOT NULL,            -- Pull quote background
    "faded_quote_rectangle_color" "text" NOT NULL,      -- Faded pull quote background
    "quote_text_color" "text" NOT NULL,                 -- Pull quote text color
    "faded_quote_text_color" "text" NOT NULL,           -- Faded pull quote text
    "metadata" "jsonb" DEFAULT '{}'::jsonb,              -- Extensible metadata
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    
    PRIMARY KEY ("id"),
    UNIQUE ("name", "conversation_id"),
    FOREIGN KEY ("anthology_id") REFERENCES "public"."anthology_anthologies"("id") ON DELETE RESTRICT,
    FOREIGN KEY ("conversation_id") REFERENCES "public"."anthology_conversations"("id") ON DELETE CASCADE
);

COMMENT ON TABLE "public"."anthology_speakers" IS 
'Participants with visual color assignments per conversation.';


-- =============================================================================
-- GRAPH NODE TABLES
-- =============================================================================

-- -----------------------------------------------------------------------------
-- anthology_questions
-- -----------------------------------------------------------------------------
-- Question nodes in the visualization graph.
-- Questions are prompts that can have responses attached to them.
-- 
-- Audio Support:
--   - Can optionally have an associated recording with start/end times
--   - Uses valid_audio_range constraint for data integrity
-- 
-- Relationships:
--   - Belongs to: anthology, conversation, recording (optional)
--   - Has many: responses, word_timestamps
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."anthology_questions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "anthology_id" "uuid" NOT NULL,                      -- FK to anthologies
    "conversation_id" "uuid" NOT NULL,                   -- FK to conversations
    "legacy_id" "text",                                  -- For JSON import compatibility
    "question_text" "text" NOT NULL,                     -- The question content
    "facilitator" "text",                                -- Who asked the question
    "recording_id" "uuid",                               -- FK to recordings (optional)
    "audio_start_ms" integer,                            -- Audio segment start (ms)
    "audio_end_ms" integer,                              -- Audio segment end (ms)
    "notes" "text",                                      -- Additional notes
    "metadata" "jsonb" DEFAULT '{}'::jsonb,              -- Extensible metadata
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    
    PRIMARY KEY ("id"),
    UNIQUE ("anthology_id", "legacy_id"),
    -- Audio range constraint: all audio fields must be present and valid, or all null
    CONSTRAINT "valid_audio_range" CHECK (
        (("recording_id" IS NULL) AND ("audio_start_ms" IS NULL) AND ("audio_end_ms" IS NULL)) 
        OR 
        (("recording_id" IS NOT NULL) AND ("audio_start_ms" IS NOT NULL) AND ("audio_end_ms" IS NOT NULL) AND ("audio_start_ms" < "audio_end_ms"))
    ),
    FOREIGN KEY ("anthology_id") REFERENCES "public"."anthology_anthologies"("id") ON DELETE RESTRICT,
    FOREIGN KEY ("conversation_id") REFERENCES "public"."anthology_conversations"("id") ON DELETE CASCADE,
    FOREIGN KEY ("recording_id") REFERENCES "public"."anthology_recordings"("id") ON DELETE SET NULL
);

COMMENT ON TABLE "public"."anthology_questions" IS 
'Question nodes in the visualization graph.';


-- -----------------------------------------------------------------------------
-- anthology_narratives
-- -----------------------------------------------------------------------------
-- Narrative nodes in the visualization graph.
-- Text-only storytelling prompts that can receive responses, similar to questions
-- but without a question mark - used for prompting stories and reflections.
-- 
-- Semantic Layout:
--   - Has optional embedding vector for UMAP-based positioning
--   - Uses OpenAI text-embedding-3-small (1536 dimensions)
-- 
-- Relationships:
--   - Belongs to: anthology, conversation (optional)
--   - Has many: responses
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."anthology_narratives" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "anthology_id" "uuid",                               -- FK to anthologies
    "conversation_id" "uuid",                            -- FK to conversations (optional)
    "legacy_id" "text",                                  -- For import compatibility
    "narrative_text" "text" NOT NULL,                    -- The narrative/prompt text
    "notes" "text",                                      -- Additional notes
    "embedding" "public"."vector"(1536),                -- Semantic embedding vector
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    
    PRIMARY KEY ("id"),
    FOREIGN KEY ("anthology_id") REFERENCES "public"."anthology_anthologies"("id") ON DELETE RESTRICT,
    FOREIGN KEY ("conversation_id") REFERENCES "public"."anthology_conversations"("id") ON DELETE CASCADE
);

COMMENT ON TABLE "public"."anthology_narratives" IS 
'Narrative nodes in the visualization graph - text-only storytelling prompts that can receive responses.';


-- -----------------------------------------------------------------------------
-- anthology_responses
-- -----------------------------------------------------------------------------
-- Response nodes in the visualization graph.
-- The core content unit - represents a speaker's contribution to a conversation.
-- 
-- Response Threading:
--   - Can respond to: questions, other responses, or narratives
--   - Only one parent allowed (enforced by responds_to_max_one constraint)
--   - All parent fields can be null for standalone responses
-- 
-- Response Types:
--   - medium: "audio" or "text" - how the response was captured
--   - synchronicity: "sync" or "asynchronous" - live vs. recorded separately
-- 
-- Semantic Layout:
--   - Has embedding vector for UMAP-based positioning
--   - Uses OpenAI text-embedding-3-small (1536 dimensions)
-- 
-- Relationships:
--   - Belongs to: anthology, conversation, speaker (optional), recording (optional)
--   - Optionally responds to: question, response, or narrative
--   - Has many: word_timestamps
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."anthology_responses" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "anthology_id" "uuid" NOT NULL,                      -- FK to anthologies
    "conversation_id" "uuid" NOT NULL,                   -- FK to conversations
    "legacy_id" "text",                                  -- For JSON import compatibility
    
    -- Parent references (only one should be set, or none for standalone)
    "responds_to_question_id" "uuid",                    -- FK to questions
    "responds_to_response_id" "uuid",                    -- FK to responses (threading)
    "responds_to_narrative_id" "uuid",                   -- FK to narratives
    
    -- Speaker information
    "speaker_id" "uuid",                                 -- FK to speakers
    "speaker_name" "text" NOT NULL,                      -- Denormalized speaker name
    
    -- Content
    "speaker_text" "text" NOT NULL,                      -- Full transcript text
    "pull_quote" "text",                                 -- Featured excerpt for display
    
    -- Audio reference
    "recording_id" "uuid",                               -- FK to recordings
    "audio_start_ms" integer,                            -- Audio segment start (ms)
    "audio_end_ms" integer,                              -- Audio segment end (ms)
    
    -- Response metadata
    "medium" "text",                                     -- "audio" or "text"
    "synchronicity" "text",                              -- "sync" or "asynchronous"
    "turn_number" integer,                               -- Display order within parent
    "chronological_turn_number" integer,                 -- Order in original conversation
    "notes" "text",                                      -- Additional notes
    "metadata" "jsonb" DEFAULT '{}'::jsonb,              -- Extensible metadata
    
    -- Semantic positioning
    "embedding" "public"."vector"(1536),                -- OpenAI embedding vector
    
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    
    PRIMARY KEY ("id"),
    UNIQUE ("anthology_id", "legacy_id"),
    
    -- Only one parent reference allowed (question OR response, not both)
    CONSTRAINT "responds_to_max_one" CHECK (
        (("responds_to_question_id" IS NULL) OR ("responds_to_response_id" IS NULL))
    ),
    -- Audio range constraint: all audio fields must be present and valid, or all null
    CONSTRAINT "valid_audio_range" CHECK (
        (("recording_id" IS NULL) AND ("audio_start_ms" IS NULL) AND ("audio_end_ms" IS NULL)) 
        OR 
        (("recording_id" IS NOT NULL) AND ("audio_start_ms" IS NOT NULL) AND ("audio_end_ms" IS NOT NULL) AND ("audio_start_ms" < "audio_end_ms"))
    ),
    -- Medium type validation
    CONSTRAINT "anthology_responses_medium_check" CHECK (
        ("medium" = ANY (ARRAY['audio'::"text", 'text'::"text"]))
    ),
    -- Synchronicity type validation
    CONSTRAINT "anthology_responses_synchronicity_check" CHECK (
        ("synchronicity" = ANY (ARRAY['sync'::"text", 'asynchronous'::"text"]))
    ),
    
    FOREIGN KEY ("anthology_id") REFERENCES "public"."anthology_anthologies"("id") ON DELETE RESTRICT,
    FOREIGN KEY ("conversation_id") REFERENCES "public"."anthology_conversations"("id") ON DELETE CASCADE,
    FOREIGN KEY ("recording_id") REFERENCES "public"."anthology_recordings"("id") ON DELETE SET NULL,
    FOREIGN KEY ("responds_to_question_id") REFERENCES "public"."anthology_questions"("id") ON DELETE SET NULL,
    FOREIGN KEY ("responds_to_response_id") REFERENCES "public"."anthology_responses"("id") ON DELETE SET NULL,
    FOREIGN KEY ("responds_to_narrative_id") REFERENCES "public"."anthology_narratives"("id") ON DELETE SET NULL,
    FOREIGN KEY ("speaker_id") REFERENCES "public"."anthology_speakers"("id") ON DELETE SET NULL
);

COMMENT ON TABLE "public"."anthology_responses" IS 
'Response nodes in the visualization graph.';

COMMENT ON COLUMN "public"."anthology_responses"."responds_to_response_id" IS 
'For responses that respond to other responses instead of questions.';

COMMENT ON COLUMN "public"."anthology_responses"."recording_id" IS 
'Individual recording for this response (allows per-node audio).';

COMMENT ON COLUMN "public"."anthology_responses"."embedding" IS 
'OpenAI text-embedding-3-small vector (1536 dimensions) for semantic positioning.';

COMMENT ON COLUMN "public"."anthology_responses"."responds_to_narrative_id" IS 
'For responses that respond to narrative nodes instead of questions or other responses.';

COMMENT ON COLUMN "public"."anthology_responses"."medium" IS 
'Type of response medium: "audio" or "text".';

COMMENT ON COLUMN "public"."anthology_responses"."synchronicity" IS 
'Synchronicity of the response: "sync" or "asynchronous".';


-- -----------------------------------------------------------------------------
-- anthology_word_timestamps
-- -----------------------------------------------------------------------------
-- Word-level timestamps for karaoke-style audio playback highlighting.
-- Each word in a response or question gets precise timing for synchronized display.
-- 
-- Relationships:
--   - Belongs to: response OR question (exactly one, enforced by constraint)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."anthology_word_timestamps" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "response_id" "uuid",                                -- FK to responses (nullable)
    "question_id" "uuid",                                -- FK to questions (nullable)
    "text" "text" NOT NULL,                              -- The word text
    "start_ms" integer NOT NULL,                         -- Word start time (ms)
    "end_ms" integer NOT NULL,                           -- Word end time (ms)
    "confidence" double precision,                       -- ASR confidence score
    "speaker" "text",                                    -- Speaker label from diarization
    "word_order" integer NOT NULL,                       -- Sequential order within parent
    "created_at" timestamp with time zone DEFAULT "now"(),
    
    PRIMARY KEY ("id"),
    -- Must belong to exactly one parent (response XOR question)
    CONSTRAINT "belongs_to_one" CHECK (
        (("response_id" IS NOT NULL) AND ("question_id" IS NULL)) 
        OR 
        (("response_id" IS NULL) AND ("question_id" IS NOT NULL))
    ),
    -- Valid time range
    CONSTRAINT "valid_time_range" CHECK (("start_ms" < "end_ms")),
    -- Confidence between 0 and 1
    CONSTRAINT "anthology_word_timestamps_confidence_check" CHECK (
        (("confidence" >= (0)::double precision) AND ("confidence" <= (1)::double precision))
    ),
    
    FOREIGN KEY ("response_id") REFERENCES "public"."anthology_responses"("id") ON DELETE CASCADE,
    FOREIGN KEY ("question_id") REFERENCES "public"."anthology_questions"("id") ON DELETE CASCADE
);

COMMENT ON TABLE "public"."anthology_word_timestamps" IS 
'Word-level timestamps for karaoke-style audio playback highlighting.';

COMMENT ON COLUMN "public"."anthology_word_timestamps"."word_order" IS 
'Sequential order of words within the parent node.';


-- =============================================================================
-- JOB TRACKING TABLES
-- =============================================================================

-- -----------------------------------------------------------------------------
-- anthology_sensemaking_jobs
-- -----------------------------------------------------------------------------
-- Async job tracking for the AI sensemaking pipeline.
-- The pipeline processes conversation audio through multiple stages:
--   1. Transcription (AssemblyAI with speaker diarization)
--   2. Turn cleaning (merge adjacent utterances, filter short turns)
--   3. Speaker naming (OpenAI inference)
--   4. Question assignment (route turns to template questions)
--   5. Turn filtering (quality thresholds)
--   6. Node upload (create database records)
-- 
-- Time-sliced execution with 15-second budget per tick for Vercel limits.
-- 
-- Relationships:
--   - Belongs to: anthology
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."anthology_sensemaking_jobs" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "anthology_id" "uuid" NOT NULL,                      -- FK to anthologies
    "anthology_slug" "text" NOT NULL,                    -- Denormalized slug
    "anthology_title" "text" NOT NULL,                   -- Denormalized title
    "template_questions" "text"[] DEFAULT '{}'::text[] NOT NULL,   -- Question templates
    "template_narratives" "text"[] DEFAULT '{}'::text[] NOT NULL,  -- Narrative templates
    "include_previous_uploads" boolean DEFAULT false NOT NULL,      -- Process existing files
    "file_paths" "text"[] DEFAULT '{}'::text[] NOT NULL,           -- Files to process
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,   -- queued/running/done/error
    "error" "text",                                       -- Error message if failed
    "progress" "jsonb" DEFAULT '{}'::jsonb NOT NULL,     -- Detailed progress tracking
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    
    PRIMARY KEY ("id"),
    FOREIGN KEY ("anthology_id") REFERENCES "public"."anthology_anthologies"("id") ON DELETE CASCADE
);

COMMENT ON COLUMN "public"."anthology_sensemaking_jobs"."template_narratives" IS 
'Array of narrative text strings from the creator UI.';


-- =============================================================================
-- VIEWS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- anthology_question_summary
-- -----------------------------------------------------------------------------
-- Summary view of questions with response counts.
-- Useful for displaying question lists with metadata.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW "public"."anthology_question_summary" AS
SELECT 
    q.id,
    q.legacy_id,
    q.question_text,
    q.facilitator,
    c.title AS conversation_title,
    count(r.id) AS response_count,
    q.created_at
FROM public.anthology_questions q
LEFT JOIN public.anthology_responses r ON r.responds_to_question_id = q.id
LEFT JOIN public.anthology_conversations c ON q.conversation_id = c.id
GROUP BY q.id, q.legacy_id, q.question_text, q.facilitator, c.title, q.created_at;


-- -----------------------------------------------------------------------------
-- anthology_response_details
-- -----------------------------------------------------------------------------
-- Detailed view of responses with joined speaker, question, and recording info.
-- Primary view for fetching complete response data for the frontend.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW "public"."anthology_response_details" AS
SELECT 
    r.id,
    r.legacy_id,
    r.speaker_text,
    r.pull_quote,
    r.audio_start_ms,
    r.audio_end_ms,
    r.turn_number,
    s.name AS speaker_name,
    s.circle_color,
    s.quote_text_color,
    q.question_text,
    q.legacy_id AS question_legacy_id,
    rec.file_path AS recording_path,
    rec.duration_ms AS recording_duration,
    c.title AS conversation_title,
    c.color AS conversation_color,
    r.created_at,
    r.updated_at
FROM public.anthology_responses r
LEFT JOIN public.anthology_speakers s ON r.speaker_id = s.id
LEFT JOIN public.anthology_questions q ON r.responds_to_question_id = q.id
LEFT JOIN public.anthology_recordings rec ON r.recording_id = rec.id
LEFT JOIN public.anthology_conversations c ON r.conversation_id = c.id;


-- =============================================================================
-- INDEXES
-- =============================================================================
-- Performance indexes for common query patterns

-- Anthologies
CREATE INDEX IF NOT EXISTS "idx_anthology_anthologies_created_at" 
    ON "public"."anthology_anthologies" USING "btree" ("created_at" DESC);

-- Conversation recordings
CREATE INDEX IF NOT EXISTS "idx_anthology_conversation_recordings_conversation" 
    ON "public"."anthology_conversation_recordings" USING "btree" ("conversation_id");
CREATE INDEX IF NOT EXISTS "idx_anthology_conversation_recordings_recording" 
    ON "public"."anthology_conversation_recordings" USING "btree" ("recording_id");
CREATE INDEX IF NOT EXISTS "idx_anthology_conversation_recordings_primary" 
    ON "public"."anthology_conversation_recordings" USING "btree" ("conversation_id") 
    WHERE ("is_primary" = true);

-- Conversations
CREATE INDEX IF NOT EXISTS "idx_anthology_conversations_anthology_id" 
    ON "public"."anthology_conversations" USING "btree" ("anthology_id");
CREATE INDEX IF NOT EXISTS "idx_anthology_conversations_created_at" 
    ON "public"."anthology_conversations" USING "btree" ("created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_anthology_conversations_date" 
    ON "public"."anthology_conversations" USING "btree" ("date" DESC);
CREATE INDEX IF NOT EXISTS "idx_anthology_conversations_legacy_id" 
    ON "public"."anthology_conversations" USING "btree" ("legacy_id");

-- Narratives
CREATE INDEX IF NOT EXISTS "idx_anthology_narratives_anthology_id" 
    ON "public"."anthology_narratives" USING "btree" ("anthology_id");
CREATE INDEX IF NOT EXISTS "idx_anthology_narratives_legacy_id" 
    ON "public"."anthology_narratives" USING "btree" ("legacy_id");
CREATE INDEX IF NOT EXISTS "idx_narratives_conversation" 
    ON "public"."anthology_narratives" USING "btree" ("conversation_id");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_anthology_narratives_anthology_legacy_id" 
    ON "public"."anthology_narratives" USING "btree" ("anthology_id", "legacy_id") 
    WHERE ("legacy_id" IS NOT NULL);
-- Vector similarity search index for semantic positioning
CREATE INDEX IF NOT EXISTS "idx_anthology_narratives_embedding" 
    ON "public"."anthology_narratives" USING "ivfflat" ("embedding" "public"."vector_cosine_ops") 
    WITH ("lists"='100');

-- Questions
CREATE INDEX IF NOT EXISTS "idx_anthology_questions_anthology_id" 
    ON "public"."anthology_questions" USING "btree" ("anthology_id");
CREATE INDEX IF NOT EXISTS "idx_anthology_questions_conversation" 
    ON "public"."anthology_questions" USING "btree" ("conversation_id");
CREATE INDEX IF NOT EXISTS "idx_anthology_questions_legacy_id" 
    ON "public"."anthology_questions" USING "btree" ("legacy_id");
CREATE INDEX IF NOT EXISTS "idx_anthology_questions_recording" 
    ON "public"."anthology_questions" USING "btree" ("recording_id");

-- Recordings
CREATE INDEX IF NOT EXISTS "idx_anthology_recordings_anthology_id" 
    ON "public"."anthology_recordings" USING "btree" ("anthology_id");
CREATE INDEX IF NOT EXISTS "idx_anthology_recordings_created_at" 
    ON "public"."anthology_recordings" USING "btree" ("created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_anthology_recordings_file_path" 
    ON "public"."anthology_recordings" USING "btree" ("file_path");

-- Responses
CREATE INDEX IF NOT EXISTS "idx_anthology_responses_anthology_id" 
    ON "public"."anthology_responses" USING "btree" ("anthology_id");
CREATE INDEX IF NOT EXISTS "idx_anthology_responses_conversation" 
    ON "public"."anthology_responses" USING "btree" ("conversation_id");
CREATE INDEX IF NOT EXISTS "idx_anthology_responses_legacy_id" 
    ON "public"."anthology_responses" USING "btree" ("legacy_id");
CREATE INDEX IF NOT EXISTS "idx_anthology_responses_question" 
    ON "public"."anthology_responses" USING "btree" ("responds_to_question_id");
CREATE INDEX IF NOT EXISTS "idx_anthology_responses_response" 
    ON "public"."anthology_responses" USING "btree" ("responds_to_response_id");
CREATE INDEX IF NOT EXISTS "idx_anthology_responses_narrative" 
    ON "public"."anthology_responses" USING "btree" ("responds_to_narrative_id");
CREATE INDEX IF NOT EXISTS "idx_anthology_responses_recording" 
    ON "public"."anthology_responses" USING "btree" ("recording_id");
CREATE INDEX IF NOT EXISTS "idx_anthology_responses_speaker" 
    ON "public"."anthology_responses" USING "btree" ("speaker_id");
CREATE INDEX IF NOT EXISTS "idx_anthology_responses_turn_number" 
    ON "public"."anthology_responses" USING "btree" ("conversation_id", "turn_number");
CREATE INDEX IF NOT EXISTS "idx_anthology_responses_chronological" 
    ON "public"."anthology_responses" USING "btree" ("conversation_id", "chronological_turn_number") 
    WHERE ("chronological_turn_number" IS NOT NULL);
-- Vector similarity search index for semantic positioning
CREATE INDEX IF NOT EXISTS "idx_anthology_responses_embedding" 
    ON "public"."anthology_responses" USING "ivfflat" ("embedding" "public"."vector_cosine_ops") 
    WITH ("lists"='100');

-- Sensemaking jobs
CREATE INDEX IF NOT EXISTS "idx_anthology_sensemaking_jobs_anthology_id" 
    ON "public"."anthology_sensemaking_jobs" USING "btree" ("anthology_id");
CREATE INDEX IF NOT EXISTS "idx_anthology_sensemaking_jobs_status" 
    ON "public"."anthology_sensemaking_jobs" USING "btree" ("status");

-- Speakers
CREATE INDEX IF NOT EXISTS "idx_anthology_speakers_anthology_id" 
    ON "public"."anthology_speakers" USING "btree" ("anthology_id");
CREATE INDEX IF NOT EXISTS "idx_anthology_speakers_conversation" 
    ON "public"."anthology_speakers" USING "btree" ("conversation_id");
CREATE INDEX IF NOT EXISTS "idx_anthology_speakers_name" 
    ON "public"."anthology_speakers" USING "btree" ("name");

-- Word timestamps
CREATE INDEX IF NOT EXISTS "idx_anthology_word_timestamps_response" 
    ON "public"."anthology_word_timestamps" USING "btree" ("response_id");
CREATE INDEX IF NOT EXISTS "idx_anthology_word_timestamps_question" 
    ON "public"."anthology_word_timestamps" USING "btree" ("question_id");
CREATE INDEX IF NOT EXISTS "idx_anthology_word_timestamps_order" 
    ON "public"."anthology_word_timestamps" USING "btree" ("response_id", "word_order") 
    WHERE ("response_id" IS NOT NULL);
CREATE INDEX IF NOT EXISTS "idx_anthology_word_timestamps_question_order" 
    ON "public"."anthology_word_timestamps" USING "btree" ("question_id", "word_order") 
    WHERE ("question_id" IS NOT NULL);


-- =============================================================================
-- TRIGGERS
-- =============================================================================
-- Automatic updated_at timestamp management

CREATE OR REPLACE TRIGGER "update_anthology_anthologies_updated_at" 
    BEFORE UPDATE ON "public"."anthology_anthologies" 
    FOR EACH ROW EXECUTE FUNCTION "public"."anthology_update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_anthology_conversations_updated_at" 
    BEFORE UPDATE ON "public"."anthology_conversations" 
    FOR EACH ROW EXECUTE FUNCTION "public"."anthology_update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_anthology_narratives_updated_at" 
    BEFORE UPDATE ON "public"."anthology_narratives" 
    FOR EACH ROW EXECUTE FUNCTION "public"."anthology_update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_anthology_questions_updated_at" 
    BEFORE UPDATE ON "public"."anthology_questions" 
    FOR EACH ROW EXECUTE FUNCTION "public"."anthology_update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_anthology_recordings_updated_at" 
    BEFORE UPDATE ON "public"."anthology_recordings" 
    FOR EACH ROW EXECUTE FUNCTION "public"."anthology_update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_anthology_responses_updated_at" 
    BEFORE UPDATE ON "public"."anthology_responses" 
    FOR EACH ROW EXECUTE FUNCTION "public"."anthology_update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_anthology_sensemaking_jobs_updated_at" 
    BEFORE UPDATE ON "public"."anthology_sensemaking_jobs" 
    FOR EACH ROW EXECUTE FUNCTION "public"."anthology_update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_anthology_speakers_updated_at" 
    BEFORE UPDATE ON "public"."anthology_speakers" 
    FOR EACH ROW EXECUTE FUNCTION "public"."anthology_update_updated_at_column"();


-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================================================
-- All tables have RLS enabled with public read access.
-- Insert policies are granted for user-contributed content.

-- Enable RLS on all tables
ALTER TABLE "public"."anthology_anthologies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."anthology_conversation_recordings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."anthology_conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."anthology_narratives" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."anthology_questions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."anthology_recordings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."anthology_responses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."anthology_sensemaking_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."anthology_speakers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."anthology_word_timestamps" ENABLE ROW LEVEL SECURITY;

-- Public read policies (all authenticated and anonymous users can read)
CREATE POLICY "Public read access" ON "public"."anthology_anthologies" FOR SELECT USING (true);
CREATE POLICY "Public read access" ON "public"."anthology_conversation_recordings" FOR SELECT USING (true);
CREATE POLICY "Public read access" ON "public"."anthology_conversations" FOR SELECT USING (true);
CREATE POLICY "Public read access" ON "public"."anthology_narratives" FOR SELECT USING (true);
CREATE POLICY "Public read access" ON "public"."anthology_questions" FOR SELECT USING (true);
CREATE POLICY "Public read access" ON "public"."anthology_recordings" FOR SELECT USING (true);
CREATE POLICY "Public read access" ON "public"."anthology_responses" FOR SELECT USING (true);
CREATE POLICY "Public read access" ON "public"."anthology_sensemaking_jobs" FOR SELECT USING (true);
CREATE POLICY "Public read access" ON "public"."anthology_speakers" FOR SELECT USING (true);
CREATE POLICY "Public read access" ON "public"."anthology_word_timestamps" FOR SELECT USING (true);

-- Public insert policies (for user-contributed content via "Add Your Voice")
CREATE POLICY "Public insert access" ON "public"."anthology_recordings" FOR INSERT WITH CHECK (true);
CREATE POLICY "Public insert access" ON "public"."anthology_responses" FOR INSERT WITH CHECK (true);
CREATE POLICY "Public insert access" ON "public"."anthology_speakers" FOR INSERT WITH CHECK (true);
CREATE POLICY "Public insert access" ON "public"."anthology_word_timestamps" FOR INSERT WITH CHECK (true);

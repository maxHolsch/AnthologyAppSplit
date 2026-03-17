# Creating an Anthology from an Audio File

This document traces the complete flow of creating an anthology from an audio file, from the UI through backend processing to final database storage.

---

## Phase 1: User Interface

**File:** `src/components/CreateAnthology/CreateAnthologyModal.tsx`

1. User clicks "Create Anthology" and enters the password
2. The modal collects:
   - **Anthology Name** — auto-generates a URL slug (e.g. "My Conversation" → `my-conversation`)
   - **Main Questions** — one per line, at least 1 required
   - **Main Narratives** — one per line, optional
   - **Audio Files** — selected via file picker
   - **Include Previous Uploads** — checkbox to include existing files in the target folder
3. User clicks "Upload selected files"

---

## Phase 2: File Upload to Supabase Storage

**File:** `src/services/conversationUploadService.ts`

For each selected file:

1. Construct a storage path: `upload_conversations/{slug}/{timestamp}_{filename}`
2. Upload to the **Conversations** Supabase Storage bucket
3. Track upload status: `idle` → `uploading` → `uploaded` or `error`

---

## Phase 3: Start Sensemaking Job

**Endpoint:** `POST /api/sensemaking/start`
**File:** `api/sensemaking/start.ts`, `api/_lib/sensemaking.ts`

When the user clicks "Run Sensemaking":

1. **Create anthology record** in `anthology_anthologies` (initially `is_public: false`)
2. **Resolve file paths** — merge uploaded paths with any previous uploads if requested; filter to audio extensions (`.mp3`, `.wav`, `.m4a`, `.aac`, `.ogg`)
3. **Initialize progress tracking** — each file marked as `pending`
4. **Create sensemaking job** in `anthology_sensemaking_jobs` with status `queued`
5. **Return** `jobId`, `anthologySlug`, and `anthologyId` to the frontend

---

## Phase 4: Polling Loop (the "Tick" Mechanism)

**Endpoint:** `POST /api/sensemaking/tick`
**File:** `api/sensemaking/tick.ts`

The frontend polls the tick endpoint every 2 seconds (with exponential backoff on failures, up to 30s). Each tick performs one discrete unit of work within a time budget (~15 seconds), designed to fit within serverless function limits.

Polling continues until the job status is `done` or `error`.

---

## Phase 5: Transcription (AssemblyAI)

Each tick checks on transcription progress:

1. **Submit audio to AssemblyAI** (up to 2 files concurrently)
   - `POST https://api.assemblyai.com/v2/transcript`
   - Requests punctuation, text formatting, and speaker diarization
2. **Poll AssemblyAI status** on subsequent ticks
   - `GET https://api.assemblyai.com/v2/transcript/{id}`
   - Status: `queued` → `processing` → `completed`
3. **On completion**, clean and merge utterances into turns:
   - Filter out utterances shorter than 2 seconds
   - Merge consecutive same-speaker utterances into single turns
   - Preserve word-level timestamps

---

## Phase 6: Speaker Naming (Claude / Anthropic)

**Model:** `claude-haiku-4-5-20251001` (configurable via `CLAUDE_SENSEMAKING_MODEL`)

1. Sample the first 30 turns of the transcript
2. Ask Claude to infer speaker names from conversational context
3. Accept names with confidence >= 0.7; otherwise default to "Speaker {label}"

---

## Phase 7: Conversation Skeleton Creation

Creates the core database records for the conversation:

| Table | What gets created |
|-------|-------------------|
| `anthology_recordings` | Recording metadata (file path, duration, mime type) |
| `anthology_conversations` | Conversation title, color, participant list |
| `anthology_conversation_recordings` | Links recording to conversation |
| `anthology_speakers` | One per speaker with assigned color scheme |
| `anthology_questions` | One per template question, linked to conversation |
| `anthology_narratives` | One per template narrative + a "Misc" catch-all; each gets an embedding vector (OpenAI) |

---

## Phase 8: Turn Processing (Time-Sliced, 5 Turns per Tick)

Each tick processes a batch of 5 turns through three stages:

### A. Question Routing (Claude)
- Each turn is assigned to the best-matching template question

### B. Narrative Assignment (OpenAI Embeddings)
- Generate embeddings for turn text using `text-embedding-3-small`
- Compare against narrative embeddings via cosine similarity
- Assign to the best match (threshold > 0.25) or "Misc"

### C. Turn Filtering (Claude)
- Evaluate whether each turn is a standalone, direct answer
- Returns keep/discard decision with confidence scores
- Currently all turns are kept (thresholds disabled)

### D. Database Upsert
Each turn is saved to `anthology_responses` with:
- Speaker info, question/narrative assignment
- Audio timestamps (`audio_start_ms`, `audio_end_ms`)
- Turn number and an embedding vector

---

## Phase 9: Completion & Publishing

When all files and turns are processed:

1. Assign chronological turn numbers across all responses (ordered by `audio_start_ms`)
2. Set job status to `done`
3. Set `is_public: true` on the anthology
4. Frontend receives `done` status and navigates to `/anthologies/{slug}`

---

## External Services Used

| Service | Purpose | Env Variable |
|---------|---------|-------------|
| **Supabase Storage** | Audio file storage (Conversations bucket) | `VITE_SUPABASE_URL`, `VITE_SUPABASE_CONVERSATIONS_BUCKET` |
| **Supabase Database** | All data storage (PostgreSQL + pgvector) | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| **AssemblyAI** | Audio transcription with speaker diarization | `ASSEMBLYAI_API_KEY` |
| **Anthropic (Claude)** | Speaker naming, question routing, turn filtering | `ANTHROPIC_API_KEY` |
| **OpenAI** | Embedding generation (`text-embedding-3-small`) | `OPENAI_API_KEY` |

---

## Database Tables

| Table | Purpose |
|-------|---------|
| `anthology_anthologies` | Top-level anthology record |
| `anthology_sensemaking_jobs` | Job state, progress tracking, configuration |
| `anthology_recordings` | Audio file metadata |
| `anthology_conversations` | Conversation metadata and participants |
| `anthology_conversation_recordings` | Recording-to-conversation links |
| `anthology_speakers` | Speaker names and color assignments |
| `anthology_questions` | Template questions per conversation |
| `anthology_narratives` | Template narratives with embedding vectors |
| `anthology_responses` | Individual speaker turns with audio timestamps, question/narrative assignments, and embeddings |

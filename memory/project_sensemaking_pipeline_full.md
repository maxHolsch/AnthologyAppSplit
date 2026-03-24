---
name: Full Sensemaking Pipeline Documentation
description: Complete reference for all 11 pipeline APIs — code links, Vercel timeout analysis, and improvement proposals
type: project
---

# Sensemaking Pipeline — Full Documentation

## Overview

The Anthology App processes audio recordings through an 11-step AI pipeline that transforms raw audio into structured, searchable conversation data published as a public anthology.

**Tech stack:** Vite + React SPA · Vercel serverless functions (`api/**/*.ts`, max 60s) · Supabase (PostgreSQL + Storage) · AssemblyAI · Claude · OpenAI

**State management:** No queue library. State is stored in `metadata` JSONB columns on DB rows. The browser client drives execution by polling `/status` and calling `/tick` until completion.

**Why:** Vercel serverless functions have a hard 60-second timeout, so long-running work is broken into bounded "tick" calls. The client orchestrates the sequence.

```
Audio File
  → [1. Transcribe]
  → [2. Prepare Turns]
  → [3. Identify Speakers]
  → [4. Create Conversation]  ← skeleton: speakers, questions, narratives
  → [5. Add Questions]        ← optional post-creation additions
  → [6. Add Narratives]       ← optional post-creation additions
  → [7. Assign Questions]     ← TRANSITION: recording → conversation scope
  → [8. Assign Narratives]
  → [9. Filter Turns]
  → [10. Create Responses]
  → [11. Set Chronological Order]
  → anthology published (is_public = true)
```

Steps 1–3 use `recordingId` and store state in `anthology_recordings.metadata`.
Steps 7–11 use `conversationId` and store state in `anthology_conversations.metadata`.
Step 7 (Assign Questions) is the transition — it copies paths from the recording into the conversation.

---

## API Reference

### 1. Transcribe

**Routes:** `POST /api/transcribe`
**Files:** [api/transcribe.ts](../api/transcribe.ts)
**Lib:** [api/_lib/assemblyai.ts](../api/_lib/assemblyai.ts)

**What it does:**
- Downloads the audio file from Supabase Storage
- Uploads raw audio bytes to AssemblyAI via `assemblyUploadAudio()`
- Starts an async diarization job via `assemblyStartTranscription()` with `speaker_labels: true` and `word_boost`
- Stores AssemblyAI job ID in `anthology_recordings.metadata.assembly_id`
- Sets `transcription_status: 'processing'` and returns 202

**DB tables:** `anthology_recordings` (UPDATE metadata)
**Storage:** reads audio file; no write at this step (transcript saved by a polling step)
**External:** AssemblyAI REST API v2 — `POST /upload`, `POST /transcript`

**Vercel behavior:** Returns in ~3–5s. AssemblyAI does the heavy lifting asynchronously. No timeout risk.

---

### 2. Prepare Turns

**Routes:** `POST /api/sensemaking/prepare-turns` · `/tick` · `/status`
**Files:** [api/sensemaking/prepare-turns.ts](../api/sensemaking/prepare-turns.ts) · [api/sensemaking/prepare-turns/tick.ts](../api/sensemaking/prepare-turns/tick.ts) · [api/sensemaking/prepare-turns/status.ts](../api/sensemaking/prepare-turns/status.ts)

**What it does:**
- Downloads the raw AssemblyAI transcript JSON from Supabase Storage
- Runs `cleanAndMergeTurns()`:
  - Filters utterances shorter than 2 seconds
  - Merges consecutive same-speaker utterances using word-level timestamps as source of truth
- Saves merged turns to `{original_path}.merged.json`
- Updates `anthology_recordings.metadata`: `prepare_turns_status`, `merged_turns_path`, `merged_turns_count`

**Output data structure:**
```typescript
MergedTurn = {
  speaker_label: string     // "Speaker A"
  start_ms: number
  end_ms: number
  text: string
  words: Array<{ text, start_ms, end_ms, confidence? }>
}
```

**DB tables:** `anthology_recordings` (UPDATE metadata)
**Storage:** reads `{recording}.transcript.json`; writes `{recording}.transcript.json.merged.json`
**External:** none

**Vercel behavior:** All work in a single `/tick`. Pure in-memory computation. Low risk for typical recordings; could approach 60s for multi-hour recordings with thousands of utterances (no chunking at this step).

---

### 3. Identify Speakers

**Routes:** `POST /api/sensemaking/identify-speakers` · `/tick` · `/status`
**Files:** [api/sensemaking/identify-speakers.ts](../api/sensemaking/identify-speakers.ts) · [api/sensemaking/identify-speakers/tick.ts](../api/sensemaking/identify-speakers/tick.ts) · [api/sensemaking/identify-speakers/status.ts](../api/sensemaking/identify-speakers/status.ts)
**Lib:** [api/_lib/openai.ts](../api/_lib/openai.ts) (`claudeJsonSchema()`)

**What it does:**
- Loads merged turns from Supabase Storage
- Takes the first 30 turns as a representative sample
- Calls Claude with a structured prompt to infer human names from diarization labels (`Speaker A`, `Speaker B`, etc.)
- Returns a speaker map: `{ "Speaker A": { name: "Alice", confidence: 0.92 } }`
- Names with confidence < 0.7 fall back to `"Speaker {label}"`
- Saves speaker map to `{merged_turns_path}.speakers.json`
- Updates `anthology_recordings.metadata`: `identify_speakers_status`, `speaker_map_path`, `speaker_count`

**DB tables:** `anthology_recordings` (UPDATE metadata)
**Storage:** reads `{}.merged.json`; writes `{}.merged.json.speakers.json`
**External:** Claude API via `claudeJsonSchema()` (model: `claude-opus-4-1` or `OPENAI_SENSEMAKING_MODEL` env override)

**Vercel behavior:** Single LLM call on ~30 turns. Typically 5–10s. Low timeout risk.

---

### 4. Create Conversation

**Routes:** `POST /api/sensemaking/create-conversation`
**Files:** [api/sensemaking/create-conversation.ts](../api/sensemaking/create-conversation.ts)
**Lib:** [api/_lib/openai.ts](../api/_lib/openai.ts) (`generateEmbeddings()`), [api/_lib/colorUtils.ts](../api/_lib/colorUtils.ts)

**What it does:**
- Loads speaker map from Storage
- Inserts the conversation skeleton in sequence:
  1. `anthology_conversations` row (title, color, participants)
  2. `anthology_conversation_recordings` link (is_primary=true)
  3. `anthology_speakers` — one per identified speaker, each with a generated color scheme (primary, secondary, accent)
  4. `anthology_questions` — from input array
  5. `anthology_narratives` — from input array + always appends a "Misc" fallback
- Generates OpenAI embeddings for each narrative text (`text-embedding-3-small`, 1536 dims)
- Stores `conversation_id` back into `anthology_recordings.metadata`
- **Idempotent:** if recording metadata already has `conversation_id`, returns existing conversation without re-inserting

**DB tables:** `anthology_conversations` · `anthology_conversation_recordings` · `anthology_speakers` · `anthology_questions` · `anthology_narratives` · `anthology_recordings` (UPDATE metadata)
**Storage:** reads `{}.speakers.json`
**External:** OpenAI Embeddings API (`text-embedding-3-small`)

**Vercel behavior:** 5 sequential DB inserts + 1 embedding batch. Typically 5–15s. Safe within 60s.

---

### 5. Add Questions

**Routes:** `POST /api/questions`
**Files:** [api/questions/](../api/questions/)

**What it does:**
- Adds one or more questions to an existing conversation
- `conversationId` required in body; `anthologyId` looked up server-side from DB
- Inserts into `anthology_questions`

**DB tables:** `anthology_questions` (INSERT), `anthology_conversations` (SELECT to verify ownership)
**External:** none

**Vercel behavior:** Single DB insert. No timeout risk.

---

### 6. Add Narratives

**Routes:** `POST /api/narratives`
**Files:** [api/narratives/](../api/narratives/)

**What it does:**
- Adds one or more narratives to an existing conversation
- Generates OpenAI embeddings at creation time (same model as Create Conversation)
- Inserts into `anthology_narratives` with embedding stored

**DB tables:** `anthology_narratives` (INSERT)
**External:** OpenAI Embeddings API

**Vercel behavior:** Single DB insert + 1 embedding call. No timeout risk.

---

### 7. Assign Questions

**Routes:** `POST /api/sensemaking/assign-questions` · `/tick` · `/status`
**Files:** [api/sensemaking/assign-questions.ts](../api/sensemaking/assign-questions.ts) · [api/sensemaking/assign-questions/tick.ts](../api/sensemaking/assign-questions/tick.ts) · [api/sensemaking/assign-questions/status.ts](../api/sensemaking/assign-questions/status.ts)

**What it does:**
- **Pipeline transition point:** The `/start` endpoint copies `merged_turns_path`, `speaker_map_path`, `bucket`, `recording_id` from `anthology_recordings.metadata` into `anthology_conversations.metadata`. All subsequent steps read only from the conversation.
- Loads all merged turns from Storage
- Fetches all `anthology_questions` for the conversation from DB
- **Batches turns in groups of 30**, sending each batch to Claude
- Claude assigns each turn a `question_index` (0-based index into the questions array)
- Each `/tick` call processes one batch and advances the batch counter in metadata
- Saves accumulated result to `{base}.assigned-questions.json`
- Client calls `/tick` repeatedly until `status: completed`

**DB tables:** `anthology_conversations` (UPDATE metadata) · `anthology_questions` (SELECT) · `anthology_speakers` (SELECT to resolve names)
**Storage:** reads `{}.merged.json`; writes/updates `{}.assigned-questions.json`
**External:** Claude API

**Vercel behavior:** **Best-in-class timeout handling.** One Claude call per 30-turn batch = 5–15s per tick. No timeout risk regardless of conversation length.

---

### 8. Assign Narratives

**Routes:** `POST /api/sensemaking/assign-narratives` · `/tick` · `/status`
**Files:** [api/sensemaking/assign-narratives.ts](../api/sensemaking/assign-narratives.ts) · [api/sensemaking/assign-narratives/tick.ts](../api/sensemaking/assign-narratives/tick.ts) · [api/sensemaking/assign-narratives/status.ts](../api/sensemaking/assign-narratives/status.ts)

**What it does:**
- Loads assigned-questions turns from Storage
- Loads all `anthology_narratives` with their stored embeddings from DB
- Generates OpenAI embeddings for all turn texts (batched at 100 texts/call)
- Computes in-memory cosine similarity between each turn embedding and each narrative embedding
- Assigns each turn to its highest-similarity narrative (`narrative_index`)
- Fallback: if no `OPENAI_API_KEY`, assigns all turns to the last narrative ("Misc")
- Saves to `{base}.assigned-narratives.json`

**Output addition per turn:** `narrative_index: number`

**DB tables:** `anthology_conversations` (UPDATE metadata) · `anthology_narratives` (SELECT embedding)
**Storage:** reads `{}.assigned-questions.json`; writes `{}.assigned-narratives.json`
**External:** OpenAI Embeddings API (batched, up to 100/call)

**Vercel behavior:** Single tick. For 300 turns: 3 embedding batches (~15s). For 600+ turns: 6+ batches (~30–40s). Medium timeout risk for very long recordings. No chunking at this step.

---

### 9. Filter Turns

**Routes:** `POST /api/sensemaking/filter-turns` · `/tick` · `/status`
**Files:** [api/sensemaking/filter-turns.ts](../api/sensemaking/filter-turns.ts) · [api/sensemaking/filter-turns/tick.ts](../api/sensemaking/filter-turns/tick.ts) · [api/sensemaking/filter-turns/status.ts](../api/sensemaking/filter-turns/status.ts)

**What it does:**
- Loads assigned-narratives turns from Storage
- Sends ALL turns to Claude in a **single call** with scoring instructions
- Claude scores each turn on two dimensions:
  - `standalone_score` (0–1): coherence out of context
  - `direct_answer_score` (0–1): relevance to its assigned question
  - `keep_reason`: short text explanation
- **Filtering thresholds are currently disabled** — all turns are kept regardless of scores; scores are preserved in metadata for UI transparency
- Saves to `{base}.filtered-turns.json`

**DB tables:** `anthology_conversations` (UPDATE metadata) · `anthology_questions` (SELECT for context)
**Storage:** reads `{}.assigned-narratives.json`; writes `{}.filtered-turns.json`
**External:** Claude API (single large call)

**Vercel behavior:** **Highest timeout risk in the pipeline.** Sends all turns in one Claude call. For 200+ turns this approaches the context window limit and the 60s wall clock. No batching at this step.

---

### 10. Create Responses

**Routes:** `POST /api/sensemaking/create-responses` · `/tick` · `/status`
**Files:** [api/sensemaking/create-responses.ts](../api/sensemaking/create-responses.ts) · [api/sensemaking/create-responses/tick.ts](../api/sensemaking/create-responses/tick.ts) · [api/sensemaking/create-responses/status.ts](../api/sensemaking/create-responses/status.ts)

**What it does:**
- Loads filtered turns from Storage
- Resolves DB IDs: fetches all `anthology_speakers`, `anthology_questions`, `anthology_narratives` for the conversation
- Matches each turn to speaker/question/narrative by name/index
- **Upserts** `anthology_responses` rows using a deterministic `legacy_id` derived from turn data (idempotent on retry)
- Generates OpenAI embeddings for each response text (batched at 100/call)
- Stores per response: `response_text`, `audio_start_ms`, `audio_end_ms`, `speaker_id`, `question_id`, `narrative_id`, `embedding`, `metadata.standalone_score`, `metadata.direct_answer_score`

**DB tables:** `anthology_responses` (UPSERT) · `anthology_speakers` (SELECT) · `anthology_questions` (SELECT) · `anthology_narratives` (SELECT) · `anthology_conversations` (UPDATE metadata)
**Storage:** reads `{}.filtered-turns.json`
**External:** OpenAI Embeddings API (batched)

**Vercel behavior:** Single tick. 3× SELECT + N upserts + batched embeddings. For 500 responses: ~5 embedding calls + 500 upserts. Medium timeout risk (~20–45s).

---

### 11. Set Chronological Order

**Routes:** `POST /api/sensemaking/set-chronological-order` · `/tick` · `/status`
**Files:** [api/sensemaking/set-chronological-order.ts](../api/sensemaking/set-chronological-order.ts) · [api/sensemaking/set-chronological-order/tick.ts](../api/sensemaking/set-chronological-order/tick.ts) · [api/sensemaking/set-chronological-order/status.ts](../api/sensemaking/set-chronological-order/status.ts)

**What it does:**
- Fetches all `anthology_responses` for the conversation ordered by `audio_start_ms ASC`
- Sets `chronological_turn_number = 1, 2, 3...` on each response in temporal order
- Updates each row (one UPDATE per response in a loop)
- Sets `anthology_anthologies.is_public = true` — **this publishes the anthology**

**DB tables:** `anthology_responses` (SELECT + UPDATE loop) · `anthology_conversations` (UPDATE metadata) · `anthology_anthologies` (UPDATE is_public)
**Storage:** none
**External:** none

**Vercel behavior:** Pure DB operations. 1–5s for any size. No timeout risk.

---

## Shared Libraries

| File | Purpose |
|---|---|
| [api/_lib/supabase.ts](../api/_lib/supabase.ts) | Lazy-initialized Supabase client with service role key; dynamic bucket selection based on schema |
| [api/_lib/openai.ts](../api/_lib/openai.ts) | `generateEmbeddings()` (batched, up to 2048/call) · `claudeJsonSchema()` (Claude via OpenAI-compat with retry) |
| [api/_lib/assemblyai.ts](../api/_lib/assemblyai.ts) | `assemblyUploadAudio()` · `assemblyStartTranscription()` · `assemblyPollTranscript()` |
| [api/_lib/colorUtils.ts](../api/_lib/colorUtils.ts) | `buildSpeakerColorScheme()` — generates primary/secondary/accent from a base color |
| [api/_lib/validation.ts](../api/_lib/validation.ts) | Zod-based request validation with flattened error responses |
| [api/_lib/errors.ts](../api/_lib/errors.ts) | Typed error codes: VALIDATION_ERROR, DATABASE_ERROR, INTERNAL_ERROR, etc. |
| [api/_lib/response.ts](../api/_lib/response.ts) | `jsonResponse()` · `errorResponse()` · `handleError()` |
| [api/_lib/http.ts](../api/_lib/http.ts) | `readJsonBody()` · `sendJson()` — low-level HTTP I/O |

---

## Database Schema

| Table | Key Columns |
|---|---|
| `anthology_anthologies` | `id`, `slug`, `title`, `is_public` |
| `anthology_recordings` | `id`, `anthology_id`, `file_name`, `duration_ms`, `metadata` (JSONB — all step 1–3 state) |
| `anthology_conversations` | `id`, `anthology_id`, `title`, `color`, `metadata` (JSONB — all step 7–11 state) |
| `anthology_conversation_recordings` | `conversation_id`, `recording_id`, `is_primary`, `recording_order` |
| `anthology_speakers` | `id`, `conversation_id`, `name`, `primary_color`, `secondary_color`, `accent_color` |
| `anthology_questions` | `id`, `conversation_id`, `question_text` |
| `anthology_narratives` | `id`, `conversation_id`, `narrative_text`, `embedding` (vector/jsonb) |
| `anthology_responses` | `id`, `conversation_id`, `speaker_id`, `question_id`, `narrative_id`, `response_text`, `audio_start_ms`, `audio_end_ms`, `chronological_turn_number`, `embedding`, `metadata` |

**Metadata pattern** used by every step:
```
[step]_status: 'processing' | 'completed' | 'error'
[step]_error: string | null
[step]_started_at: ISO8601
[step]_completed_at: ISO8601
[step]_path: string          (storage path for intermediate file)
[step]_count: number         (items processed)
```

---

## Vercel Timeout Analysis

All serverless functions run with `"maxDuration": 60` (set in [vercel.json](../vercel.json)).

| Step | Typical tick duration | Timeout risk | Notes |
|---|---|---|---|
| Transcribe | ~3–5s | None | Async hand-off to AssemblyAI |
| Prepare Turns | ~2–30s | Low–Medium | No external calls; pure in-memory merge |
| Identify Speakers | ~5–10s | Low | 30-turn cap on input |
| Create Conversation | ~5–15s | Low | 5 DB inserts + small embedding batch |
| Assign Questions | ~5–15s/tick | **None** | Already chunked at 30 turns/tick |
| Assign Narratives | ~10–40s | Medium | All turns embedded in one tick |
| Filter Turns | ~10–55s | **HIGH** | All turns in single Claude call |
| Create Responses | ~15–45s | Medium | Bulk upsert + embedding batches |
| Set Chronological | ~1–5s | None | Pure DB |

**Critical finding:** Filter Turns is the only step that can reliably fail for large recordings. It sends every turn to Claude in a single request, which can exceed both the LLM context window and the 60s wall clock for conversations with 200+ turns.

**Assign Questions** is the model to follow — it was designed with Vercel constraints in mind. All other multi-turn steps should adopt the same 30-turn batching pattern.

---

## Improvement Proposals

### 1. Platform: Declarative Pipeline Architecture

**Problem:** Each step is independently authored with duplicated boilerplate (start/tick/status pattern repeated 8 times). Adding a new step means copy-pasting and manually wiring in the client orchestration.

**Proposal:** Build a `PipelineRunner` that reads from a declarative step registry:

```typescript
// api/_lib/pipeline.ts
interface PipelineStep {
  id: string
  dependsOn: string[]
  execute: (ctx: PipelineContext, chunk?: number) => Promise<PipelineResult>
  chunked: boolean
  chunkSize?: number
}

// Each step becomes a pure function
const assignQuestionsStep: PipelineStep = {
  id: 'assign-questions',
  dependsOn: ['identify-speakers'],
  chunked: true,
  chunkSize: 30,
  execute: async (ctx, chunkIndex) => { /* ... */ }
}
```

The runner handles: status transitions, storage path management, retry logic, and tick sequencing. New steps are registered, not wired.

**Note:** The project already has `@langchain/langgraph` installed — this is exactly the orchestration problem LangGraph solves. Worth evaluating as the runner foundation.

---

### 2. Server-Driven Execution (Replace Browser Polling)

**Problem:** The browser calls `/tick` in a loop. If the user navigates away, the pipeline stalls mid-run. There is no retry if a tick times out.

**Current flow:**
```
Browser → POST /tick → result → Browser → POST /tick → ...
```

**Proposed flow with Inngest:**
```
Browser → POST /start → 202
Inngest worker → /tick → next tick (auto, with retries)
Browser → GET /status (read-only, cheap)
```

Benefits:
- Pipeline completes even if browser closes
- Automatic retry with exponential backoff on timeout/error
- Fan-out: dispatch all batches in parallel (Assign Questions 10× faster)
- Built-in observability dashboard

Alternative with lower adoption cost: **Vercel Cron** triggered by `/start` + QStash for step-to-step chaining.

---

### 3. Fix High-Risk Steps

**Filter Turns (highest priority):**
- Apply the same 30–50 turn batching pattern as Assign Questions
- Add the question text to each batch so Claude has context for `direct_answer_score`
- Currently thresholds are disabled — expose `standalone_score` / `direct_answer_score` in the UI so users can manually review flagged turns instead of auto-filtering

**Assign Narratives:**
- Already batches embedding calls (good), but runs all in one tick
- For large conversations, chunk into 100-turn ticks (matching the embedding batch size)

**Create Responses:**
- Separate embedding generation from DB upserts: upsert all rows first, then embed in batches across multiple ticks
- Or: generate embeddings lazily on first semantic search rather than at pipeline time

---

### 4. Per-Step Improvements

**Identify Speakers:**
- Replace "first 30 turns" sample with stratified sampling (turns from beginning, middle, and end of conversation) — better inference for conversations where speakers shift context over time
- Surface confidence scores in the UI so users know when inference is uncertain
- Allow manual name correction with corrections stored for future sessions

**Assign Questions:**
- Parallelize batch dispatching when server-driven execution is in place (all batches run concurrently instead of sequentially — 10× speedup for 300-turn conversations)
- Add question embeddings to DB (already done for narratives) to pre-filter candidates before the Claude call, reducing token cost

**Set Chronological Order:**
- Replace N individual UPDATEs with a single window function query:
  ```sql
  UPDATE anthology_responses SET chronological_turn_number = t.rn
  FROM (
    SELECT id, ROW_NUMBER() OVER (ORDER BY audio_start_ms) AS rn
    FROM anthology_responses WHERE conversation_id = $1
  ) t
  WHERE anthology_responses.id = t.id
  ```
  Eliminates N database round trips.

---

### 5. Observability & Resilience

**Problem:** A tick that times out leaves `[step]_status = 'processing'` forever. No way to detect or recover stalled pipelines.

**Improvements:**
- Add `[step]_last_tick_at` timestamp — if > 5 minutes old, auto-transition to `'stalled'` state
- Add `[step]_progress` (0–100) for percent-complete display in UI
- Add a `anthology_pipeline_events` log table for audit trail (step started, tick completed, error details)
- On any error, store enough context in `[step]_error` to replay from the last checkpoint without re-running earlier steps

---

### 6. Cost & Performance

**Combine Filter Turns + Assign Questions:**
Both make Claude calls per turn. They can be merged into a single prompt per batch:
> "For each turn: (a) assign it to the best question, (b) score its standalone coherence and direct relevance."

This halves the number of Claude API calls with no quality loss.

**Model tiering:**
- Filter Turns (quality scoring) → use **Claude Haiku**: cheaper, fast, sufficient for 0–1 scoring
- Identify Speakers → keep Opus: requires genuine reasoning about sparse context
- Assign Questions → keep Opus: semantic routing judgment matters

**Storage cleanup:**
The pipeline produces 5 intermediate JSON files per conversation. After `create-responses` completes, all information is in the DB — the intermediate files can be archived to cold storage or deleted, freeing Supabase Storage quota.

---

## Why: Context for this document

The Anthology App sensemaking pipeline was built incrementally across multiple sessions. This document was created to consolidate knowledge about the complete pipeline, document the Vercel timeout constraints that shaped its architecture, and propose a path toward more robust and composable execution. The tick/poll pattern is the right instinct for serverless — it just needs to be applied consistently across all steps and eventually backed by server-side job execution rather than browser polling.

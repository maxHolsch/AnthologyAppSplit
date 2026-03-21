---
name: Identify Speakers API - Pattern & Context
description: What we built for the identify-speakers step and a detailed brief for the next step (create-conversation-skeleton)
type: project
---

## What we built

Three API endpoints for the second post-transcription step in the sensemaking pipeline:

- `POST /api/sensemaking/identify-speakers` — start the job
- `GET /api/sensemaking/identify-speakers/status` — read-only status check
- `POST /api/sensemaking/identify-speakers/tick` — execute the work (calls Claude)

**Why:** Continuing the decomposition of the monolithic `/api/sensemaking/start` pipeline into
individually callable steps.

---

## Files created / modified

| File | Role |
|---|---|
| `api/sensemaking/identify-speakers.ts` | POST handler — validates recording, checks prepare_turns_status=completed, sets status=processing, returns 202 |
| `api/sensemaking/identify-speakers/status.ts` | GET handler — reads metadata, returns current status |
| `api/sensemaking/identify-speakers/tick.ts` | POST handler — loads merged turns, calls Claude, saves speaker map JSON |
| `scripts/test-identify-speakers.ts` | Test script with `--reset` flag to clean up data |
| `scripts/api-server.ts` | Added three route registrations |
| `docs/api/openapi.yaml` | Added Identify Speakers tag + three endpoint specs |
| `package.json` | Added `"test:identify-speakers": "tsx scripts/test-identify-speakers.ts"` |

---

## Inputs / Outputs

### Inputs (tick)
- `merged_turns_path` from recording metadata → downloads `MergedTurn[]` from storage
- `ANTHROPIC_API_KEY` env var
- `CLAUDE_SENSEMAKING_MODEL` env var (defaults to `claude-haiku-4-5-20251001`)
- Samples first 30 turns as Claude context

### Output written to storage
```
<merged_turns_path>.speakers.json
```
Contents:
```json
{
  "speakerMap": { "A": { "name": "Alice", "confidence": 0.92 }, "B": { "name": "Speaker B", "confidence": 0.4 } },
  "speakerCount": 2,
  "processedAt": "...",
  "recordingId": "..."
}
```
Names with confidence < 0.7 fall back to `"Speaker {label}"`.

### Metadata fields written to `anthology_recordings.metadata`
```
identify_speakers_status:       'processing' | 'completed' | 'error'
identify_speakers_error:        string | null
identify_speakers_started_at:   ISO timestamp
identify_speakers_completed_at: ISO timestamp
speaker_map_path:               storage path to speaker map JSON
speaker_count:                  integer
```

### Prerequisite check in POST
`prepare_turns_status === 'completed'`

### Reset command
```bash
npm run test:identify-speakers <recordingId> -- --reset
```
Deletes `speaker_map_path` file from storage and clears all `identify_speakers_*` metadata fields.

---

## Test script Supabase import pattern

Do NOT import from `../api/_lib/supabase` in test scripts — tsx ESM resolution fails on that module.
Instead, initialize the client inline:

```typescript
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
  const schema = process.env.SUPABASE_DB_SCHEMA || 'public';
  return createClient(url, key, { db: { schema }, auth: { autoRefreshToken: false, persistSession: false } });
}

function getConversationsBucket(): string {
  const schema = process.env.SUPABASE_DB_SCHEMA || 'public';
  return schema !== 'public' ? 'Development_Conversations' : 'Conversations';
}
```

---

## Next step: Create Conversation Skeleton

**Core function to expose:** `ensureConversationSkeleton()` in `api/_lib/sensemaking.ts`

### What it does
Creates all the Supabase database rows needed before turn-level processing can begin:

| Table | Rows created |
|---|---|
| `anthology_recordings` | 1 row (the recording itself) |
| `anthology_conversations` | 1 row |
| `anthology_conversation_recordings` | 1 link row |
| `anthology_speakers` | 1 per speaker name |
| `anthology_questions` | 1 per template question |
| `anthology_narratives` | 1 per template narrative + 1 "Misc" row |

Also generates OpenAI embeddings for all narrative rows (if `OPENAI_API_KEY` is set).

### Key architectural issue to resolve

In the **old monolithic pipeline**, `ensureConversationSkeleton` **creates** the `anthology_recordings`
row itself. But in the **new split pipeline**, the recording **already exists** — it was created when
the file was uploaded and has been the subject of all previous steps (transcribe, prepare-turns,
identify-speakers). The new API must NOT create a duplicate recording row.

Options:
1. Create a new `createConversationSkeleton()` variant that accepts an existing `recordingId` and
   skips the recording insert — just creates conversation/speakers/questions/narratives and links
   to the existing recording.
2. Pass the existing `recordingId` and upsert based on it.

**Option 1 is recommended** — cleanest separation.

### Inputs needed (from the API request + derived from metadata/storage)

From request body:
- `recordingId` — existing recording (prerequisite: `identify_speakers_status === 'completed'`)
- `anthologyId` — which anthology to attach to
- `templateQuestions` — string[] (the question prompts)
- `templateNarratives` — string[] (the narrative themes)
- `paletteIndex` — integer for color assignment (could default to 0 or be derived from recording order)

From recording metadata (already stored from previous steps):
- `transcript_path` → download full AssemblyAI transcript JSON (needed for duration, audio_duration)
- `speaker_map_path` → download speaker map, extract resolved speaker names for `speakerNames[]`
- `bucket` → storage bucket name

From env:
- `OPENAI_API_KEY` — optional, for narrative embeddings
- `SUPABASE_*` vars

### Outputs

Returned in the tick response and stored in `recording.metadata`:
```
create_skeleton_status:       'processing' | 'completed' | 'error'
create_skeleton_error:        string | null
create_skeleton_started_at:   ISO timestamp
create_skeleton_completed_at: ISO timestamp
conversation_id:              UUID
question_db_ids:              string[] (JSON-serialized or stored as metadata array)
narrative_db_ids:             string[]
speaker_db_ids:               Record<string, string> (label → db UUID)
```

### Proposed endpoints
- `POST /api/sensemaking/create-skeleton` — start job
- `GET /api/sensemaking/create-skeleton/status` — status check
- `POST /api/sensemaking/create-skeleton/tick` — execute (DB writes, optional embeddings)

### Prerequisite check in POST
`identify_speakers_status === 'completed'`

### Test script
Model after `scripts/test-identify-speakers.ts`, save as `scripts/test-create-skeleton.ts`,
register as `"test:create-skeleton": "tsx scripts/test-create-skeleton.ts"` in package.json.
Include `--reset` flag that deletes the created conversation and all linked rows.

---

## Full pipeline sequence (for reference)

```
POST /api/transcribe                        ← already separate
POST /api/sensemaking/prepare-turns         ← built (session 1)
POST /api/sensemaking/identify-speakers     ← built (session 2)
POST /api/sensemaking/create-skeleton       ← next (session 3)
POST /api/sensemaking/assign-questions      ← batch version of /api/judge-question
POST /api/sensemaking/assign-narratives     ← batch version of /api/assign-narrative
POST /api/sensemaking/filter-turns          ← wraps filterTurnsForUpload()
POST /api/responses/create-batch            ← wraps upsertResponseBatch()
POST /api/conversations/:id/set-chronological-order ← wraps setChronologicalTurnNumbers()
```

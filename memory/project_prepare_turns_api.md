---
name: Prepare Turns API - Pattern & Context
description: How we built the prepare-turns API step and the pattern to follow for subsequent sensemaking pipeline steps (identify-speakers, assign-questions, etc.)
type: project
---

## What we built

Three API endpoints for the first post-transcription step in the sensemaking pipeline:

- `POST /api/sensemaking/prepare-turns` — start the job
- `GET /api/sensemaking/prepare-turns/status` — read-only status check
- `POST /api/sensemaking/prepare-turns/tick` — execute the work

**Why:** We are breaking up the monolithic `/api/sensemaking/start` pipeline into individual
callable steps so each step can be called independently via API.

**How to apply:** Each subsequent pipeline step (identify-speakers, assign-questions,
assign-narratives, filter-turns, create-responses) should follow the same POST/status/tick pattern.

---

## Files created / modified

| File | Role |
|---|---|
| `api/sensemaking/prepare-turns.ts` | POST handler — validates recording, sets status=processing, returns 202 |
| `api/sensemaking/prepare-turns/status.ts` | GET handler — reads metadata, returns current status |
| `api/sensemaking/prepare-turns/tick.ts` | POST handler — downloads transcript, runs cleanAndMergeTurns, saves result |
| `scripts/test-prepare-turns.ts` | Test script: run with `npm run test:prepare-turns <recordingId>` |
| `scripts/api-server.ts` | Added the three route registrations |
| `scripts/README.md` | Documents how to use the test scripts |
| `docs/api/openapi.yaml` | Added Prepare Turns tag + three endpoint specs |
| `package.json` | Added `"test:prepare-turns": "tsx scripts/test-prepare-turns.ts"` |

---

## The POST/status/tick pattern (model for all subsequent steps)

This is modelled after `api/transcribe.ts` / `api/transcribe/status.ts` / `api/transcribe/tick.ts`.

### POST (start)
- Validates the recording exists and prerequisite step is complete
- Sets `<step>_status: 'processing'` in `recording.metadata`
- Computes and stores the output storage path in metadata (e.g. `merged_turns_path`)
- Returns 202 immediately
- **Idempotent:** if status is already `completed`, return current state without re-running

### GET status
- Reads `recording.metadata` and returns `<step>_status`, paths, timestamps, error
- No side effects

### POST tick
- Short-circuits if status is already `completed` or `error` (returns `didWork: false`)
- Guards that status is `processing` before doing work
- Downloads input from storage, runs the core function, uploads output to storage
- Updates `recording.metadata` with `<step>_status: 'completed'` and result fields
- Returns `didWork: true` on success

### Metadata fields convention (per step)
```
<step>_status:       'processing' | 'completed' | 'error'
<step>_error:        string | null
<step>_started_at:   ISO timestamp
<step>_completed_at: ISO timestamp
<output>_path:       storage path to the output JSON file
<output>_count:      integer summary (e.g. merged_turns_count)
```

### Response envelope
All API responses use `jsonResponse()` from `api/_lib/response.ts`, which wraps data:
```json
{ "data": { ...actual fields... } }
```
Test scripts must access `response.data.*` not `response.*` directly.

---

## Storage path conventions

```
transcript:    <object_path>.transcript.json
merged turns:  <object_path>.transcript.json.merged.json
(next steps will follow the same chaining pattern)
```

Bucket is read from `recording.metadata.bucket`, falling back to `getConversationsBucket()`.

---

## Core function (lives in sensemaking.ts)

`cleanAndMergeTurns(utterances: AssemblyUtterance[]): MergedTurn[]`

- Filters utterances shorter than 2000ms
- Merges adjacent same-speaker utterances
- Reanchors `start_ms` / `end_ms` using word-level timestamps (prevents drift)
- Already exists in `api/_lib/sensemaking.ts` — the tick handler duplicates it locally
  (could be extracted to a shared lib in future)

---

## Next step: Identify Speakers

**Core function to expose:** `guessSpeakerNames()` in `api/_lib/sensemaking.ts`

```typescript
async function guessSpeakerNames({
  apiKey,      // ANTHROPIC_API_KEY
  model,       // CLAUDE_SENSEMAKING_MODEL or 'claude-haiku-4-5-20251001'
  mergedTurns, // MergedTurn[] — output of prepare-turns
}): Promise<Record<string, { name: string; confidence: number }>>
```

- Input: merged turns (read from `merged_turns_path` in storage)
- Uses Claude to infer speaker names from transcript context (first 30 turns as sample)
- Returns a speaker map: `{ "A": { name: "Alice", confidence: 0.92 }, "B": { ... } }`
- Requires confidence >= 0.7 to use an inferred name; otherwise falls back to `"Speaker A"`

**Proposed endpoints:**
- `POST /api/sensemaking/identify-speakers` — start job
- `GET /api/sensemaking/identify-speakers/status` — status check
- `POST /api/sensemaking/identify-speakers/tick` — execute (calls Claude, saves speaker map JSON)

**New metadata fields to add:**
```
identify_speakers_status:       'processing' | 'completed' | 'error'
identify_speakers_error:        string | null
identify_speakers_started_at:   ISO timestamp
identify_speakers_completed_at: ISO timestamp
speaker_map_path:               storage path to speaker map JSON
speaker_count:                  integer
```

**Prerequisite check in POST:** `prepare_turns_status === 'completed'`

**Test script:** model after `scripts/test-prepare-turns.ts`, save as `scripts/test-identify-speakers.ts`,
register as `"test:identify-speakers": "tsx scripts/test-identify-speakers.ts"` in package.json.

---

## Full pipeline sequence (for reference)

```
POST /api/transcribe                    ← already separate
POST /api/sensemaking/prepare-turns     ← built today
POST /api/sensemaking/identify-speakers ← next
POST /api/sensemaking/assign-questions  ← batch version of /api/judge-question
POST /api/sensemaking/assign-narratives ← batch version of /api/assign-narrative
POST /api/sensemaking/filter-turns      ← wraps filterTurnsForUpload()
POST /api/conversations/create-skeleton ← wraps ensureConversationSkeleton()
POST /api/responses/create-batch        ← wraps upsertResponseBatch()
POST /api/conversations/:id/set-chronological-order ← wraps setChronologicalTurnNumbers()
```

All core functions already exist in `api/_lib/sensemaking.ts`.

---

## API server port

Local API server runs on **port 3001** (not 3000).
Start with: `npm run dev:api`

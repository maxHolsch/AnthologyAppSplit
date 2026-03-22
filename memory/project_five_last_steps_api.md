---
name: Five Last Sensemaking Steps API
description: Status of the APIs, tick endpoints, test scripts, and OpenAPI docs for the 5 post-conversation sensemaking pipeline steps
type: project
---

All 5 post-conversation sensemaking pipeline steps now have complete, working APIs using `conversationId` with status tracked in `anthology_conversations.metadata`.

**Why:** The earlier approach used `recordingId` and recording metadata, but these 5 steps all run after a conversation exists — conversationId is the right identifier.

**How to apply:** When referencing or extending these APIs, use `conversationId` (not `recordingId`). Status fields live in `anthology_conversations.metadata`, not `anthology_recordings.metadata`.

## Pipeline order (post-conversation steps only)

1. `assign-questions` — Claude routes each merged turn to its best-matching question
2. `assign-narratives` — OpenAI embeddings assign each turn a narrative (fallback: all → Misc)
3. `filter-turns` — Claude scores turns for quality (currently all kept, thresholds disabled)
4. `create-responses` — upserts `anthology_responses` rows, generates embeddings
5. `set-chronological-order` — sets `chronological_turn_number` by `audio_start_ms` order

## Key design decisions

- **`assign-questions` start** copies `merged_turns_path`, `speaker_map_path`, and `bucket` from recording metadata into conversation metadata, so all downstream steps read purely from conversation metadata and never touch the recording again.
- **Path derivation:** each start endpoint derives its output path from the previous step's path by stripping the suffix (e.g. `.assigned-questions.json` → `.assigned-narratives.json`).
- **`create-responses/tick`** reads `anthology_id` from `anthology_conversations.anthology_id` (direct column), and `recording_id` from `convMeta.recording_id` (copied in by assign-questions start).

## Files

### API endpoints (all complete)
- `api/sensemaking/assign-questions.ts` — POST start
- `api/sensemaking/assign-questions/status.ts` — GET status
- `api/sensemaking/assign-questions/tick.ts` — POST tick
- `api/sensemaking/assign-narratives.ts` / `status.ts` / `tick.ts`
- `api/sensemaking/filter-turns.ts` / `status.ts` / `tick.ts`
- `api/sensemaking/create-responses.ts` / `status.ts` / `tick.ts`
- `api/sensemaking/set-chronological-order.ts` / `status.ts` / `tick.ts`

### Test scripts (all accept `conversationId`, have `--reset` mode)
- `scripts/test-assign-questions.ts`
- `scripts/test-assign-narratives.ts`
- `scripts/test-filter-turns.ts`
- `scripts/test-create-responses.ts`
- `scripts/test-set-chronological-order.ts`

### Routes registered in
- `scripts/api-server.ts` — 15 routes added after the identify-speakers block

### npm scripts registered in
- `package.json` — 5 entries: `test:assign-questions`, `test:assign-narratives`, `test:filter-turns`, `test:create-responses`, `test:set-chronological-order`

### Docs
- `docs/api/openapi.yaml` — all 15 paths documented with `conversationId` throughout

## Metadata keys per step (in `anthology_conversations.metadata`)

### assign-questions
`assign_questions_status`, `assign_questions_error`, `assign_questions_started_at`, `assign_questions_completed_at`, `assigned_questions_path`, `assign_questions_turn_count`
Also copied in by start: `recording_id`, `merged_turns_path`, `speaker_map_path`, `bucket`

### assign-narratives
`assign_narratives_status`, `assign_narratives_error`, `assign_narratives_started_at`, `assign_narratives_completed_at`, `assigned_narratives_path`, `assign_narratives_turn_count`

### filter-turns
`filter_turns_status`, `filter_turns_error`, `filter_turns_started_at`, `filter_turns_completed_at`, `filtered_turns_path`, `filtered_turns_count`

### create-responses
`create_responses_status`, `create_responses_error`, `create_responses_started_at`, `create_responses_completed_at`, `response_count`

### set-chronological-order
`set_chronological_order_status`, `set_chronological_order_error`, `set_chronological_order_started_at`, `set_chronological_order_completed_at`, `chronological_response_count`

## Status: COMPLETE
All files written, YAML validated (`npx js-yaml` → valid).

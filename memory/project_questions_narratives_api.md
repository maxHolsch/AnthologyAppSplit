---
name: Questions and Narratives API — Session 2026-03-21
description: Summary of work done adding POST endpoints for questions and narratives without requiring a conversation ID, fixing DB constraint issues, and adding test scripts
type: project
---

## What we built

Added `POST /api/questions` and `POST /api/narratives` endpoints that allow creating questions and narratives using only a `conversationId` (no need for client to pass `anthologyId` — the server looks it up).

## Issues fixed along the way

### Auth removed from POST handlers
The POST endpoints initially called `requireAuth`, which blocked unauthenticated clients. Removed it — the server uses the Supabase service role key and has its own credentials.

### DB constraint: `conversation_id` NOT NULL
The questions table requires `conversation_id`. Made `conversationId` required in `CreateQuestionSchema` and `CreateNarrativeSchema`.

### DB constraint: `anthology_id` NOT NULL (questions)
Both `anthology_questions` and `anthology_narratives` require `anthology_id`. Rather than requiring the client to pass it, the server looks it up from the conversation:
```ts
const { data: conversation } = await supabase
  .from('anthology_conversations')
  .select('anthology_id')
  .eq('id', conversationId)
  .maybeSingle();
```

### `color` column does not exist on `anthology_narratives`
Removed `color` from the narratives insert — that column doesn't exist in the schema cache.

## Data model clarification

- One question per record (`questionText` is a single question, no delimiter support)
- One narrative per record (`narrativeText` is a single narrative, no delimiter support)
- Bulk creation would require a separate endpoint accepting an array

## Test scripts added

`scripts/test-create-narratives.ts` — mirrors the pattern from `test-create-questions.ts`:
```bash
# Create narratives
npm run test:create-narratives <conversationId> "Narrative 1" "Narrative 2"

# Clean up (skips narratives with non-null embeddings)
npm run test:create-narratives <conversationId> -- --reset
```

The `--reset` flag only deletes narratives where `embedding IS NULL` to avoid destroying records that have already been processed downstream.

## Next steps (pending)

- Create `POST /api/conversations` endpoint (create conversation skeleton from recording ID) — this is the step in the sensemaking pipeline after identify-speakers
- Update OpenAPI documentation for questions and narratives endpoints

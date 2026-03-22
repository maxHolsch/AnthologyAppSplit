# Memory Index

## Project

- [project_prepare_turns_api.md](project_prepare_turns_api.md) — How we built the prepare-turns API, the POST/status/tick pattern to follow for all subsequent sensemaking pipeline steps, and a detailed brief for the next step (identify-speakers)
- [project_identify_speakers_api.md](project_identify_speakers_api.md) — How we built the identify-speakers API, inputs/outputs, the Supabase import fix for test scripts, and a detailed brief for the next step (create-conversation-skeleton)
- [project_questions_narratives_api.md](project_questions_narratives_api.md) — POST endpoints for questions and narratives (conversationId required, anthologyId looked up server-side), DB fixes, test scripts, and next steps
- [project_five_last_steps_api.md](project_five_last_steps_api.md) — APIs, tick endpoints, test scripts, and OpenAPI docs for the 5 post-conversation sensemaking steps (assign-questions, assign-narratives, filter-turns, create-responses, set-chronological-order). All use `conversationId` with status in `anthology_conversations.metadata`. Complete.

## Feedback

- [feedback_test_script_supabase_import.md](feedback_test_script_supabase_import.md) — Do not import from api/_lib/supabase in test scripts; initialize Supabase client inline instead

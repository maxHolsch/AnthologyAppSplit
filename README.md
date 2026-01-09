# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Sensemaking ("Run sensemaking" button)

The creator flow in [`CreateAnthologyModal`](anthology-app/src/components/CreateAnthology/CreateAnthologyModal.tsx:17) supports uploading conversation audio files and running an async “sensemaking” pipeline that:

- Transcribes each recording with AssemblyAI (speaker diarization enabled)
- Deletes speaker turns shorter than 2 seconds
- Merges adjacent turns from the same speaker into a single “speaker turn”
- Guesses speaker names with an OpenAI model, but only applies a name if confidence is high; otherwise keeps `Speaker A/B/...`
- Creates **1 question node per template question per recording**
- Creates response nodes per merged speaker turn and routes each to the best matching template question
- Persists everything into existing `anthology_*` tables (recordings/conversations/speakers/questions/responses/word timestamps)

### Database migration required

Run the migration [`2025-12-15_add_sensemaking_jobs.sql`](database/migrations/2025-12-15_add_sensemaking_jobs.sql:1) in Supabase SQL Editor to create the `anthology_sensemaking_jobs` table used for async progress tracking.

### Required environment variables

Copy [`anthology-app/.env.example`](anthology-app/.env.example:1) to `anthology-app/.env` and fill:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_SUPABASE_CONVERSATIONS_BUCKET` (default `Conversations`)
- `ASSEMBLYAI_API_KEY`
- `OPENAI_API_KEY`
- `SUPABASE_SERVICE_KEY` (service role key; **server-side only**)

Notes:

- Local dev uses Vite middleware routes configured in [`vite.config.ts`](anthology-app/vite.config.ts:11) so `/api/sensemaking/*` works under `npm run dev`.
- Production (Vercel) uses serverless functions in [`api/sensemaking/*`](anthology-app/api/sensemaking/start.ts:1).

### Progress model

The UI polls the async job by repeatedly calling `POST /api/sensemaking/tick` and renders per-file steps:

- `pending → transcription_queued → transcribing → transcript_ready → cleaning_short_turns → speaker_naming → question_assignment → uploading_nodes → done`

Transcription concurrency is capped at **2**.

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

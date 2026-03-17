# Create Anthology Modal - Requirements & Services

This document describes the functional requirements and backend service integrations necessary to build the functionality seen in `CreateAnthologyModal.tsx`.

## Functional Requirements

### 1. Modal Interface
- An overlay modal providing the "Create anthology" workflow.
- Can be dismissed/closed via a close button or by clicking the backdrop.

### 2. User Inputs & Parsing
- **Anthology Name**: A text input to name the anthology. Automatically generates a URL-friendly `slug` which acts as a folder identifier.
- **Main Questions**: A multiline textarea to paste core questions. The input is automatically parsed (split by newlines, stripped of bullet characters like `-`, `*`, `•`, and whitespace-trimmed). It is required to have at least one question.
- **Main Narratives**: An optional multiline textarea to paste key narratives, parsed similarly to the questions.
- **Include Previous Uploads**: A checkbox that dictates whether any previously uploaded files in the target folder should be included in the processing.

### 3. File Upload Workflow
- Users can select multiple conversation files (likely audio/video recordings or text transcripts) via a file picker.
- **Validation**: Upload requires the anthology name to be filled and at least one file selected.
- **Upload Action**: Uploads the files to the designated anthology folder.
- **Status Tracking**: Displays a list of selected files with a clear status indicator (`idle`, `uploading`, `uploaded`, `error`) and associated success paths or error messages.

### 4. Sensemaking (Processing) Workflow
- **Triggering Validation**: Starting the "Sensemaking" process requires an anthology name, at least one successfully uploaded file, and at least one template question.
- **Progress Polling**: Once started, the system polls the backend to track the background job progress.
  - The UI updates to show the overall job status (`queued`, `running`, `done`, `error`) and the progress ratio (e.g., `1/3 recordings done`).
  - The UI displays granular, file-level progress steps and messages.
  - The polling system uses exponential backoff in case of network/server errors.
  - Polling will automatically halt if the modal is unmounted/closed.
- **Completion**: On a successful `done` status, the modal automatically closes and redirects the user to the newly created anthology's page (`/anthologies/{slug}`).

---

## Assumed Backend System Architecture

Based on frontend hints like "recordings done", "Tick can take longer when a transcript completes (LLM + DB writes)", the backend is doing heavy lifting. 

### Core Components Needed:
1. **Relational Database**: To store Anthologies, Transcripts, LLM outputs, and Job Statuses.
2. **File Storage**: To store uploaded conversation files.
3. **Background Job Queue**: Essential for handling long-running audio transcription and LLM inference tasks.
4. **Transcription Service**: To convert audio/video recordings into text.
5. **LLM Service**: To read transcripts, answer the defined Main Questions, and extract Narratives.

---

## API Endpoints & Contracts

### 1. Conversation File Upload Service
Handled via `ConversationUploadService.uploadConversations`.

**Action:** Uploads a list of files to a specific storage directory tied to the anthology slug.

* **Input Payload:** `anthologyFolderSlug` (string), `files` (File[])
* **Output Response:** Array of objects: `{ fileName: string, ok: boolean, path?: string, error?: string }`

### 2. Start Sensemaking API
Initiates the asynchronous background task of transcribing and analyzing the conversations.

**Endpoint:** `POST /api/sensemaking/start`

* **Request Payload (JSON):**
  ```json
  {
    "anthologySlug": "my-sensemaking-conversation",
    "anthologyTitle": "My Sensemaking Conversation",
    "templateQuestions": ["Question 1", "Question 2"],
    "templateNarratives": ["Narrative 1"],
    "uploadedFilePaths": ["path/to/file1.mp3"],
    "includePreviousUploads": false
  }
  ```
* **Success Response (JSON):** `{ "jobId": "uuid", "anthologySlug": "slug", "anthologyId": "db-id" }`

### 3. Poll Sensemaking Tick API
Actively checks the status of an ongoing sensemaking job. The `timeBudgetMs` payload suggests the endpoint might actually perform small chunks of work synchronously on each request or simply wait for a queue update.

**Endpoint:** `POST /api/sensemaking/tick`

* **Request Payload (JSON):** `{ "jobId": "uuid", "timeBudgetMs": 15000 }`
* **Success Response (JSON) - `200 OK`:**
  ```json
  {
    "jobId": "uuid",
    "status": "queued" | "running" | "done" | "error",
    "anthologySlug": "slug",
    "anthologyId": "db-id",
    "progress": {
      "overall": { "done": 1, "total": 3 },
      "files": {
        "path/to/file1.mp3": { "step": "transcribing", "message": "Using Whisper...", "updated_at": "..." }
      }
    }
  }
  ```

---

## Third-Party Services & Accounts Required

To build this backend properly, you will need the following third-party provider accounts and integration keys.

### 1. File Storage (e.g., AWS S3 or Cloudflare R2)
You need an object storage bucket to safely store large conversation files (audio/video).
* **Accounts to create:**
  - AWS (for S3) OR Cloudflare (for R2, which has cheaper egress).
* **Keys needed:**
  - `AWS_ACCESS_KEY_ID`
  - `AWS_SECRET_ACCESS_KEY`
  - `AWS_REGION`
  - `AWS_BUCKET_NAME`

### 2. Database (e.g., PostgreSQL via Supabase or Neon)
You need a database to store user states, anthology metadata, exact transcripts, generated answers to questions, and job progress.
* **Accounts to create:**
  - Supabase, Neon, or Railway (any Postgres provider).
* **Keys needed:**
  - `DATABASE_URL` (Connection string)

### 3. Transcription / Speech-to-Text API
Based on the frontend code mentioning "recordings" and "transcripts", you need an AI transcription service.
* **Accounts to create (Choose one):**
  - **OpenAI:** For the Whisper API.
  - **Deepgram:** Usually much faster and specifically optimized for audio transcription.
  - **AssemblyAI:** Great alternative with speaker diarization.
* **Keys needed:**
  - `OPENAI_API_KEY` or `DEEPGRAM_API_KEY`

### 4. Large Language Model (LLM) API
This is the heart of the "Sensemaking" feature. It reads the transcripts and answers the questions/narratives provided by the user.
* **Accounts to create (Choose one or multiple):**
  - **OpenAI:** For GPT-4o.
  - **Anthropic:** For Claude 3.5 Sonnet (excellent for complex text extraction/reasoning).
* **Keys needed:**
  - `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`

### 5. Background Job / Queue Service (Optional but Recommended)
For long-running AI tasks, holding an HTTP connection open is risky. You can use services that handle job queues, retries, and webhooks.
* **Accounts to create (Choose one):**
  - **Inngest** or **Trigger.dev**: Managed background job services for TypeScript/Next.js/Node.
  - Alternatively, you can use Redis (e.g., Upstash) + BullMQ if managing your own queue.
* **Keys needed:**
  - `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` (if using Inngest)
  - `REDIS_URL` (if using your own BullMQ queue)

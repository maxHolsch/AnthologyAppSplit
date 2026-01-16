# Anthology - Comprehensive Codebase Documentation

## Project Overview

**Anthology** is an interactive visualization platform for exploring conversations through a graph-based interface. It allows users to view questions, responses, and speakers as interconnected nodes with audio playback capabilities. The platform supports multiple anthologies (collections of conversations) and enables users to record and contribute their own responses.

### Key Features
- Interactive D3.js force-directed graph visualization
- Audio playback with word-level karaoke-style highlighting
- Multi-anthology support for organizing different conversation sets
- User-contributed responses via recording or file upload
- AI-powered sensemaking pipeline for processing new conversation audio
- Real-time updates via Supabase subscriptions

---

## Technology Stack

### Frontend
| Technology | Version | Purpose |
|------------|---------|---------|
| React | 19.1.1 | UI framework |
| TypeScript | ~5.9.3 | Type safety |
| Vite | 7.1.7 | Build tool and dev server |
| D3.js | 7.9.0 | Graph visualization |
| Zustand | 5.0.8 | State management |
| React Router | 6.30.1 | Client-side routing |
| Supabase JS | 2.87.1 | Database client |

### Backend
| Technology | Purpose |
|------------|---------|
| Vercel Serverless Functions | API endpoints |
| Supabase PostgreSQL | Database and storage |
| AssemblyAI | Speech-to-text transcription |
| OpenAI | Question matching and speaker naming |
| LangChain/LangGraph | AI orchestration (0.3.0/0.2.0) |

---

## Directory Structure

```
Anthology/
├── anthology-app/                 # Main React application
│   ├── api/                       # Vercel serverless functions
│   │   ├── _lib/                  # Shared backend libraries
│   │   │   ├── sensemaking.ts     # AI pipeline orchestration
│   │   │   ├── assemblyai.ts      # AssemblyAI API wrapper
│   │   │   ├── openai.ts          # OpenAI API integration
│   │   │   └── http.ts            # HTTP utilities
│   │   ├── transcribe.ts          # POST /api/transcribe
│   │   ├── judge-question.ts      # POST /api/judge-question
│   │   ├── embeddings/            # Embedding generation
│   │   │   └── generate.ts        # POST /api/embeddings/generate
│   │   └── sensemaking/           # Sensemaking job endpoints
│   │       ├── start.ts           # POST /api/sensemaking/start
│   │       ├── tick.ts            # POST /api/sensemaking/tick
│   │       └── status.ts          # GET /api/sensemaking/status
│   ├── scripts/                   # Maintenance and utility scripts
│   │   ├── check-anthologies.ts   # Verify anthology counts
│   │   ├── check-db-schema.ts     # Validate table structures
│   │   ├── inspect-anthology.ts   # Dump data for a specific slug
│   │   └── migrate-hearst-anthology.ts # Legacy migration script
│   ├── src/
│   │   ├── components/            # React components
│   │   │   ├── AddYourVoice/      # Recording/upload UI
│   │   │   ├── Audio/             # Audio playback components
│   │   │   ├── CreateAnthology/   # Anthology creation flow
│   │   │   ├── Map/               # D3 visualization components
│   │   │   ├── Rail/              # Right sidebar components
│   │   │   └── UI/                # Generic UI components
│   │   ├── hooks/                 # Custom React hooks
│   │   ├── pages/                 # Page components
│   │   │   ├── HomePage/          # Anthology list page
│   │   │   └── ViewerPage/        # Anthology viewer page
│   │   ├── services/              # API/data services
│   │   │   ├── supabase.ts        # Canonical Supabase service layer
│   │   │   ├── transcription.ts   # Transcription service
│   │   │   └── questionPlacement.ts
│   │   ├── stores/                # Zustand state stores
│   │   │   ├── AnthologyStore.ts  # Main application state
│   │   │   ├── InteractionStore.ts
│   │   │   └── VisualizationStore.ts
│   │   ├── styles/                # CSS styles
│   │   ├── types/                 # TypeScript type definitions
│   │   │   ├── data.types.ts      # Core data models
│   │   │   ├── component.types.ts # Component props
│   │   │   └── store.types.ts     # Store interfaces
│   │   ├── utils/                 # Utility functions
│   │   │   ├── audioUtils.ts      # Audio playback helpers
│   │   │   ├── colorAssignment.ts # Speaker color system
│   │   │   ├── dataProcessor.ts   # JSON to graph conversion
│   │   │   ├── semanticLayout.ts  # UMAP and semantic positioning
│   │   │   └── slugify.ts         # URL slug generation
│   │   ├── App.tsx                # Main app component
│   │   ├── Root.tsx               # Route definitions
│   │   └── main.tsx               # Entry point
│   ├── public/                    # Static assets
│   ├── package.json               # Dependencies
│   ├── vite.config.ts             # Vite configuration
│   ├── vercel.json                # Vercel deployment config
│   └── .env.example               # Environment template
│
├── database/                      # Database migrations
│   ├── migrations/                # SQL migration files
│   └── ...                        # Legacy migration scripts
│
├── cloud_schema.sql               # Canonical database schema dump
├── Design.md                      # Design specifications
└── Documentation.md               # This file
```

---

## Core Data Types

### `data.types.ts` - Primary Data Models

#### Conversation
```typescript
interface Conversation {
  conversation_id: string;
  audio_file: string;          // Path to audio file
  duration: number;            // Duration in milliseconds
  color: string;               // Hex color for visualization
  metadata: ConversationMetadata;
}

interface ConversationMetadata {
  title?: string;
  date?: string;
  participants: string[];
  speaker_colors?: Record<string, string | SpeakerColorScheme>;
  location?: string;
  facilitator?: string;
  topics?: string[];
}
```

#### Question Node
```typescript
interface QuestionNode {
  type: 'question';
  id: string;
  question_text: string;
  related_responses: string[];  // Response node IDs
  facilitator?: string;
  notes?: string;
  path_to_recording?: string;
}
```

#### Response Node
```typescript
interface ResponseNode {
  type: 'response';
  id: string;
  responds_to: string;            // Question, Response, or Narrative ID
  responds_to_narrative_id?: string; // Explicit narrative link
  speaker_name: string;
  speaker_text: string;
  pull_quote?: string;            // Featured excerpt for rectangle display
  audio_start: number;            // Timestamp in ms
  audio_end: number;              // Timestamp in ms
  conversation_id: string;
  path_to_recording?: string;     // Optional standalone recording
  turn_number?: number;
  word_timestamps?: WordTimestamp[];
  medium?: 'audio' | 'text';      // Response medium type
  synchronicity?: 'sync' | 'asynchronous'; // Response synchronicity
  embedding?: number[];           // 1536-dim vector for semantic layout
}
```

#### Narrative Node
```typescript
interface NarrativeNode {
  type: 'narrative';
  id: string;
  narrative_text: string;         // Prompt/story text
  related_responses?: string[];   // Response node IDs
  notes?: string;
  path_to_recording?: string;
}
```

#### Narrative Label Node (Visual)
```typescript
interface NarrativeLabelNode {
  type: 'narrative_label';
  id: string;
  narrative_id: string;
  narrative_name: string;
  narrative_color: string;
  centroid_x: number;             // Weighted center of response cluster
  centroid_y: number;
}
```

#### Word Timestamp (Karaoke Highlighting)
```typescript
interface WordTimestamp {
  text: string;
  start: number;    // milliseconds
  end: number;      // milliseconds
  speaker?: string;
  confidence?: number;
}
```

#### Graph Types
```typescript
interface GraphNode {
  id: string;
  type: 'question' | 'response' | 'prompt';
  data: AnthologyNode;
  x?: number;       // D3 position
  y?: number;
  color?: string;
}

interface GraphEdge {
  source: string | GraphNode;
  target: string | GraphNode;
  color?: string;
}
```

---

## Database Schema

The Anthology platform uses a Supabase-hosted PostgreSQL database. 

> [!IMPORTANT]
> The canonical source of truth for the database schema is [cloud_schema.sql](file:///Users/alrightsettledownwethroughtoday/Desktop/Coding/Anthology/Anthology/anthology-app/cloud_schema.sql).

### Core Tables
- `anthology_anthologies`: Top-level dataset partitions.
- `anthology_conversations`: Discussion sessions.
- `anthology_questions`: Prompt nodes.
- `anthology_narratives`: Storytelling prompts (supports embeddings).
- `anthology_responses`: Speaker contribution nodes (supports embeddings).
- `anthology_speakers`: Participant color assignments.
- `anthology_recordings`: Audio file metadata.
- `anthology_word_timestamps`: Fine-grained timing for karaoke display.
- `anthology_sensemaking_jobs`: Async AI pipeline status.

For detailed table relationships, foreign keys, and RLS policies, please refer directly to the [cloud_schema.sql](file:///Users/alrightsettledownwethroughtoday/Desktop/Coding/Anthology/Anthology/anthology-app/cloud_schema.sql) file.

---

## State Management

### AnthologyStore (`stores/AnthologyStore.ts`)

The main Zustand store manages application state with four slices:

#### Data Slice
```typescript
interface DataState {
  rawData: AnthologyData | null;
  nodes: Map<string, GraphNode>;
  edges: Map<string, GraphEdge>;
  questionNodes: Map<string, QuestionNode>;
  narrativeNodes: Map<string, NarrativeNode>;
  responseNodes: Map<string, ResponseNode>;
  conversations: Map<string, Conversation>;
  colorAssignments: Map<string, ColorAssignment>;
  speakerColorAssignments: Map<string, SpeakerColorAssignment>;
  narrativeColorAssignments: Map<string, string>;
  isLoading: boolean;
  loadError: string | null;
}
```

#### Selection Slice
```typescript
interface SelectionState {
  selectedNodes: Set<string>;
  hoveredNode: string | null;
  focusedNode: string | null;
  selectionMode: 'single' | 'multi' | 'question';
  selectionHistory: string[][];
}
```

#### View Slice
```typescript
interface ViewState {
  railExpanded: boolean;
  railWidth: number;
  railMode: 'conversations' | 'question' | 'narrative' | 'single';
  activeQuestion: string | null;
  activeNarrative: string | null;
  activeResponse: string | null;
  mapTransform: MapTransform;
  zoomLevel: number;
}
```

#### Audio Slice
```typescript
interface AudioState {
  playbackState: 'idle' | 'playing' | 'paused' | 'loading';
  playbackMode: 'single' | 'medley' | 'shuffle';
  currentTrack: string | null;
  currentTime: number;
  duration: number;
  audioElement: HTMLAudioElement | null;
  playlist: string[];
  playlistIndex: number;
  volume: number;
  playbackSpeed: number;
  highlightedWord: number | null;
}
```

#### Key Actions
- `loadData(data)`: Load anthology data and build graph structure
- `selectNode(nodeId, mode)`: Select a node (single or multi-select)
- `selectQuestion(questionId)`: Select a question and all its responses
- `selectResponse(responseId)`: Select a single response
- `play(nodeId)`: Start audio playback for a response
- `setRailMode(mode)`: Switch between conversations/question/single view

### VisualizationStore (`stores/VisualizationStore.ts`)

Manages D3 visualization state including:
- Node positions
- Zoom/pan transform
- Force simulation parameters

### InteractionStore (`stores/InteractionStore.ts`)

Manages UI interaction state:
- Tooltip content and position
- Drag state
- Keyboard shortcuts

---

## Services

### Supabase Service (`services/supabase.ts`)

#### AnthologyService
```typescript
AnthologyService.listPublic(): Promise<AnthologySummary[]>
AnthologyService.getBySlug(slug): Promise<AnthologySummary | null>
```

#### GraphDataService
```typescript
// Main entry point for loading visualization data
GraphDataService.loadAll({ anthologySlug? }): Promise<{
  conversations: Conversation[];
  questions: QuestionNode[];
  responses: ResponseNode[];
}>

// Subscribe to real-time updates
GraphDataService.subscribeToUpdates(callback): () => void
```

#### ConversationService
```typescript
ConversationService.getAll({ anthologyId? }): Promise<Conversation[]>
ConversationService.getById(id): Promise<Conversation | null>
ConversationService.getSpeakers(conversationId): Promise<Map<string, SpeakerColorScheme>>
```

#### ResponseService
```typescript
ResponseService.getByConversation(conversationId): Promise<ResponseNode[]>
ResponseService.getWordTimestamps(responseId): Promise<WordTimestamp[]>
```

#### RecordingService
```typescript
RecordingService.getById(id): Promise<Recording | null>
RecordingService.upload(file, durationMs?): Promise<Recording | null>
```

#### NarrativeService
```typescript
NarrativeService.getByConversation(conversationId): Promise<NarrativeNode[]>
```

#### AdminService
```typescript
AdminService.addResponse({ conversationId, questionId, speakerName, ... })
AdminService.addResponseToResponse({ conversationId, parentResponseId, ... })
AdminService.addResponseToQuestion({ conversationId, questionId, ... })
AdminService.addResponseToNarrative({ conversationId, narrativeId, ... })
```

---

## API Endpoints

### `POST /api/transcribe`
Transcribes audio using AssemblyAI.

**Request:**
```json
{ "audioUrl": "https://..." }
```

**Response:**
```json
{
  "text": "Full transcript text",
  "words": [
    { "text": "Hello", "start": 0, "end": 500, "confidence": 0.98 }
  ]
}
```

### `POST /api/judge-question`
Matches a response to the best template question using OpenAI.

**Request:**
```json
{
  "transcript": "The speaker's text...",
  "questions": [
    { "id": "q_001", "text": "What do you think about...?" }
  ]
}
```

**Response:**
```json
{
  "bestQuestionId": "q_001",
  "rankedQuestionIds": ["q_001", "q_002", "q_003"],
  "reason": "The response directly addresses..."
}
```

### `POST /api/sensemaking/start`
Initiates a sensemaking job for processing conversation audio.

**Request:**
```json
{
  "anthologySlug": "my-anthology",
  "anthologyTitle": "My Anthology",
  "templateQuestions": ["Question 1?", "Question 2?"],
  "uploadedFilePaths": ["upload_conversations/my-anthology/file.mp3"],
  "includePreviousUploads": true
}
```

**Response:**
```json
{
  "jobId": "uuid",
  "anthologySlug": "my-anthology",
  "anthologyId": "uuid"
}
```

### `POST /api/sensemaking/tick`
Processes the next step of a sensemaking job (time-sliced for Vercel limits).

**Request:**
```json
{
  "jobId": "uuid",
  "timeBudgetMs": 15000
}
```

### `GET /api/sensemaking/status?jobId=...`
Returns job progress and status.

**Response:**
```json
{
  "jobId": "uuid",
  "status": "running",
  "anthologySlug": "my-anthology",
  "anthologyId": "uuid",
  "progress": {
    "overall": { "done": 1, "total": 3 },
    "files": {
      "path/to/file.mp3": {
        "step": "turn_filtering",
        "message": "Processing turns...",
        "cursor": 15,
        "total_turns": 50
      }
    }
  }
}
```

### Embeddings

#### `POST /api/embeddings/generate`
Generates OpenAI embeddings for a set of text strings.
- **Request Body**: `{ "text": string | string[] }`
- **Response**: `{ "embeddings": number[][] }`

---

## Sensemaking Pipeline

The sensemaking pipeline (`api/_lib/sensemaking.ts`) processes conversation audio through multiple stages:

### Pipeline Stages
1. **Transcription** (`transcription_queued` → `transcribing` → `transcript_ready`)
   - Uses AssemblyAI for speech-to-text with speaker diarization
   - Polls for completion every 15 seconds

2. **Turn Cleaning** (`cleaning_short_turns`)
   - Merges adjacent utterances from the same speaker
   - Filters out turns shorter than 2 seconds

3. **Speaker Naming** (`speaker_naming`)
   - Uses OpenAI to infer speaker names from context
   - Falls back to "Speaker A", "Speaker B" if uncertain

4. **Question Assignment** (`question_assignment`)
   - Routes each turn to the best matching template question
   - Uses OpenAI with structured JSON output

5. **Turn Filtering** (`turn_filtering`)
   - Filters turns based on standalone quality and direct answer relevance
   - Uses conservative thresholds (0.65 standalone, 0.7 direct answer)

6. **Node Upload** (`uploading_nodes`)
   - Creates conversation, speakers, questions in database
   - Upserts responses with word timestamps

### Time-Sliced Execution
- Each `tick` call has a 15-second budget (default)
- Progress is persisted to `anthology_sensemaking_jobs` table
- Supports retries and resumption after timeouts

---

## Semantic Layout & Embeddings

Anthology uses a semantic layout engine to position response nodes based on the similarity of their content.

### 1. Embedding Generation (Backend)
- **Model**: OpenAI `text-embedding-3-small`
- **Output**: 1536-dimensional vectors
- **Content**: The `speaker_text` of each response is embedded.
- **Storage**: Stored in the `embedding` column of the `anthology_responses` table as a vector string.
- **Trigger**: Currently manual via `database/backfill_embeddings.ts` or during specific API flows.

### 2. UMAP Projection (Frontend)
- **Library**: `umap-js` (client-side execution)
- **File**: `src/utils/semanticLayout.ts`
- **Process**:
  1. Frontend loads all response embeddings.
  2. UMAP projects high-dimensional vectors (1536d) down to 2D coordinates (x, y).
  3. Coordinates are scaled to fit a visual range (default ±500px).
- **Result**: Responses with similar content appear physically closer together in the graph.

### 3. D3 Integration
- **Fixed Positions**: The calculated UMAP coordinates are assigned to `fx` (fixed x) and `fy` (fixed y) properties on the D3 nodes.
- **Physics**: This overrides the default D3 force simulation physics for position, meaning nodes remain "pinned" to their semantic location while edges still exert some influence.

> [!IMPORTANT]
> **"All or Nothing" Fallback**
> The semantic layout is strictly "All or Nothing".
> - **Condition**: `responses.length === responsesWithEmbeddings.length`
> - **Behavior**: If **even a single response** is missing an embedding (e.g., empty text, failed backfill), the system completely disables UMAP.
> - **Fallback**: The layout reverts to a "Radial Orbit" mode, where responses are positioned in a circle around their parent question.

---

## Visualization Details

### Force Simulation "Reheating"
The D3 force simulation includes a fix for over-cooling during pre-warming.
- **Problem**: Pre-warming (175 ticks) could drop `alpha` below `alphaMin` (0.001) before rendering, making nodes appear static.
- **Solution**: The simulation is "reheated" after pre-warming to ensure it animations correctly on screen.
- **Implementation**: `simulation.alpha(1).restart()` is called in `VisualizationStore.ts` after initial ticks.

---

## Component Architecture

### Map Components (`components/Map/`)

#### MapCanvas.tsx
Main D3 container component that:
- Sets up SVG viewport with zoom behavior
- Manages force simulation lifecycle
- Handles node/edge rendering delegation

#### D3Visualization.tsx
Core D3 force simulation:
- Configures forces (charge, link, collision, center)
- Updates node positions on simulation tick
- Handles zoom/pan transforms

#### QuestionNode.tsx
Renders question nodes as circles with text labels.

#### ResponseNode.tsx
Renders response nodes as either:
- Circles (default)
- Pull quote rectangles (when `pull_quote` is present)

#### EdgePath.tsx
Renders curved connection paths between nodes.

### Rail Components (`components/Rail/`)

#### CommentRail.tsx
Main sidebar container with three view modes:
- `conversations`: List of all conversations
- `question`: Question with all related responses
- `single`: Single response detail view

#### Views/QuestionView.tsx
Displays a question with all its responses.

#### Views/SingleView.tsx
Detailed view of a single response with:
- Full transcript text
- Play/pause controls
- Karaoke-style word highlighting

#### Views/KaraokeDisplay.tsx
Word-level text highlighting during audio playback.

### Audio Components (`components/Audio/`)

#### AudioManager.tsx
Global audio orchestration that:
- Manages HTMLAudioElement lifecycle
- Handles audio segment playback
- Coordinates with store for playback state

#### AudioPlayer.tsx
Playback controls UI with:
- Play/pause button
- Progress bar
- Volume control
- Playback speed selector

#### MedleyPlayer.tsx
Multi-track audio playback for playing multiple responses in sequence.

#### HighlightedText.tsx
Text display with synchronized word highlighting based on audio position.

### Recording Components (`components/AddYourVoice/`)

#### AddYourVoiceButton.tsx
Floating action button to initiate recording.

#### AddYourVoiceModal.tsx
Modal for recording/uploading a response:
- Audio recording via MediaRecorder API
- File upload support
- Speaker name input
- Question selection
- Transcription preview

---

## Data Flow

### Loading an Anthology
```
1. User navigates to /anthologies/:slug
2. ViewerPage calls AnthologyService.getBySlug(slug)
3. App component calls GraphDataService.loadAll({ anthologySlug })
4. Service queries Supabase for:
   - Conversations with recordings
   - Questions per conversation
   - Responses with word timestamps
   - Speaker color assignments
5. Store's loadData() builds graph structure:
   - Creates GraphNodes for questions and responses
   - Creates GraphEdges for responds_to relationships
   - Assigns colors based on speaker/conversation
6. D3Visualization calculates node positions
7. MapCanvas renders nodes and edges
8. CommentRail shows conversation list
```

### Recording a New Response
```
1. User clicks "Add Your Voice" button
2. AddYourVoiceModal opens
3. User records audio or uploads file
4. Audio uploaded to Supabase Storage
5. POST /api/transcribe returns transcript
6. User confirms speaker name and question
7. AdminService.addResponseToQuestion() called
8. New response inserted into anthology_responses
9. Word timestamps stored in anthology_word_timestamps
10. ViewerPage refetches data to show new node
```

### Creating a New Anthology (Sensemaking)
```
1. User clicks "Create Anthology" (password protected)
2. CreateAnthologyModal opens
3. User uploads conversation audio files
4. Files uploaded to Conversations bucket
5. POST /api/sensemaking/start creates job
6. Client polls POST /api/sensemaking/tick
7. Pipeline processes each file:
   - Transcribe → Speaker naming → Question routing → Filtering → Upload
8. When complete, anthology.is_public = true
9. New anthology appears on homepage
```

---

## Environment Variables

### Frontend (`.env`)
```bash
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_SUPABASE_RECORDINGS_BUCKET=Recordings
VITE_SUPABASE_CONVERSATIONS_BUCKET=Conversations
```

### Backend (Vercel)
```bash
SUPABASE_SERVICE_KEY=eyJ...
ASSEMBLYAI_API_KEY=xxx
OPENAI_API_KEY=sk-xxx
OPENAI_SENSEMAKING_MODEL=gpt-4o-mini  # optional, defaults to gpt-4o-mini
```

---

## Color System

### Conversation Colors
Default palette for conversation identification:
```javascript
const DEFAULT_COLORS = [
  '#4A90E2',  // Blue
  '#FF5F1F',  // Orange
  '#6CC686',  // Green
  '#CC82E7',  // Purple
  '#F7ACEA',  // Pink
  '#6CB7FA',  // Light Blue
  '#FFB84D',  // Gold
  '#7B68EE',  // Medium Slate Blue
  '#FF6B6B',  // Coral
  '#4ECDC4',  // Turquoise
];
```

### Speaker Color Scheme
Each speaker has multiple color variants for different visual states:
```typescript
interface SpeakerColorScheme {
  circle: string;              // Selected circle node
  fadedCircle: string;         // Faded circle node
  quoteRectangle: string;      // Selected pull quote background
  fadedQuoteRectangle: string; // Faded pull quote background
  quoteText: string;           // Selected pull quote text
  fadedQuoteText: string;      // Faded pull quote text
}
```

Color generation utilities in `utils/colorUtils.ts`:
- `hexToRgba(hex, alpha)`: Convert hex to RGBA
- `darkenColor(hex, percent)`: Darken a color
- `lightenColor(hex, percent)`: Lighten a color

---

## Routing

### Routes (`Root.tsx`)
```typescript
<Routes>
  <Route path="/" element={<HomePage />} />
  <Route path="/anthologies/:slug" element={<ViewerPage />} />
  <Route path="*" element={<HomePage />} />
</Routes>
```

### URL Structure
- `/` - Homepage with list of public anthologies
- `/anthologies/:slug` - Viewer for a specific anthology

---

## Development

### Scripts
```bash
cd anthology-app

# Development server with API middleware
npm run dev

# Production build
npm run build

# Lint code
npm run lint

# Preview production build
npm run preview
```

### Local API Development
The Vite dev server includes middleware for local API testing (`vite.config.ts`):
- `/api/transcribe` → `api/transcribe.ts`
- `/api/judge-question` → `api/judge-question.ts`
- `/api/sensemaking/*` → `api/sensemaking/*.ts`

### Database Migrations
```bash
cd database

# Run migrations against Supabase
psql $DATABASE_URL -f migrations/2025-12-14_add_anthologies.sql
psql $DATABASE_URL -f migrations/2025-12-15_add_sensemaking_jobs.sql

# Import JSON data
npx tsx migrate_json_to_sql_prefixed.ts

# Backfill word timestamps
npx tsx backfill_word_timestamps_prefixed.ts
```

---

## Deployment

### Vercel Configuration (`vercel.json`)
```json
{
  "buildCommand": "cd anthology-app && npm run build",
  "outputDirectory": "anthology-app/dist",
  "installCommand": "cd anthology-app && npm install"
}
```

### Environment Setup
1. Create Supabase project
2. Run `database/schema_prefixed.sql`
3. Configure storage buckets (Recordings, Conversations)
4. Set environment variables in Vercel
5. Deploy via `vercel deploy`

---

## Recent Development

### Current Branch: `multiple-anthologies`
Work in progress on multi-anthology support.

### Recent Commits
- `9054109`: Important updates
- `aea28da`: Updated DB to allow for multiple anthologies
- `7f0190f`: Refactored database code
- `e203b71`: Audio karaoke improvements and upload button
- `f361a66`: Write your own answer feature

### Maintenance Scripts
Located in `anthology-app/scripts/`:

- `check-anthologies.ts`: Verify count of data nodes per anthology.
- `check-db-schema.ts`: Validate table columns and constraints.
- `inspect-anthology.ts`: Dump data for a specific anthology slug.
- `migrate-hearst-anthology.ts`: Historical migration utility.

Run using `npx tsx scripts/<filename>.ts`.

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `anthology-app/src/App.tsx` | Main application component |
| `anthology-app/src/services/supabase.ts` | Canonical data service layer |
| `anthology-app/src/stores/AnthologyStore.ts` | Main state management |
| `anthology-app/src/components/Map/D3Visualization.tsx` | Force simulation |
| `anthology-app/src/components/Audio/AudioManager.tsx` | Audio orchestration |
| `anthology-app/api/_lib/sensemaking.ts` | AI pipeline |
| `cloud_schema.sql` | Canonical database schema |

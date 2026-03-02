# Anthology - Comprehensive Codebase Documentation

## Project Overview

**Anthology** is an interactive visualization platform for exploring conversations through a graph-based interface. It allows users to view questions, responses, narratives, and speakers as interconnected nodes with audio playback capabilities. The platform supports multiple anthologies (collections of conversations) and enables users to record and contribute their own responses.

### Key Features
- Interactive D3.js force-directed graph visualization
- Audio playback with word-level karaoke-style highlighting
- Multi-anthology support for organizing different conversation sets
- Narrative and question-based view modes
- User-contributed responses via recording or file upload
- AI-powered sensemaking pipeline for processing new conversation audio
- REST API architecture with standardized endpoints

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

### Backend
| Technology | Purpose |
|------------|---------|
| Vercel Serverless Functions | REST API endpoints |
| Supabase PostgreSQL | Database and storage |
| Zod | Request validation |
| AssemblyAI | Speech-to-text transcription |
| OpenAI | Question matching and speaker naming |
| LangChain/LangGraph | AI orchestration (0.3.0/0.2.0) |

---

## Directory Structure

```
anthology-app-split/
├── api/                           # Vercel serverless functions (REST API)
│   ├── _lib/                      # Shared backend utilities
│   │   ├── auth.ts                # JWT authentication helpers
│   │   ├── errors.ts              # Error codes and ApiException class
│   │   ├── response.ts            # Response helpers (json, paginated, error)
│   │   ├── validation.ts          # Zod validation schemas
│   │   ├── supabase.ts            # Supabase client initialization
│   │   ├── colorUtils.ts          # Speaker color scheme generation
│   │   ├── sensemaking.ts         # AI pipeline orchestration
│   │   ├── assemblyai.ts          # AssemblyAI API wrapper
│   │   ├── openai.ts              # OpenAI API integration
│   │   └── http.ts                # HTTP utilities
│   ├── anthologies/               # Anthology endpoints
│   │   ├── index.ts               # GET/POST /api/anthologies
│   │   └── [slug].ts              # GET /api/anthologies/:slug
│   ├── conversations/             # Conversation endpoints
│   │   ├── index.ts               # GET /api/conversations
│   │   ├── [id].ts                # GET /api/conversations/:id
│   │   └── [id]/
│   │       ├── speakers.ts        # GET /api/conversations/:id/speakers
│   │       ├── questions.ts       # GET /api/conversations/:id/questions
│   │       ├── responses.ts       # GET /api/conversations/:id/responses
│   │       └── narratives.ts      # GET /api/conversations/:id/narratives
│   ├── questions/                 # Question endpoints
│   │   ├── index.ts               # GET /api/questions
│   │   └── [id]/
│   │       └── responses.ts       # GET /api/questions/:id/responses
│   ├── responses/                 # Response endpoints
│   │   ├── index.ts               # GET/POST /api/responses
│   │   ├── [id].ts                # GET/DELETE /api/responses/:id
│   │   └── [id]/
│   │       └── word-timestamps.ts # GET /api/responses/:id/word-timestamps
│   ├── narratives/                # Narrative endpoints
│   │   ├── index.ts               # GET/POST /api/narratives
│   │   └── [id]/
│   │       └── responses.ts       # GET /api/narratives/:id/responses
│   ├── speakers/                  # Speaker endpoints
│   │   ├── index.ts               # GET /api/speakers
│   │   └── [id].ts                # GET /api/speakers/:id
│   ├── graph/
│   │   └── load.ts                # GET /api/graph/load (complete data)
│   ├── embeddings/
│   │   └── generate.ts            # POST /api/embeddings/generate
│   ├── sensemaking/               # AI pipeline endpoints
│   │   ├── start.ts               # POST /api/sensemaking/start
│   │   ├── tick.ts                # POST /api/sensemaking/tick
│   │   └── status.ts              # GET /api/sensemaking/status
│   ├── assign-narrative.ts        # POST /api/assign-narrative
│   ├── transcribe.ts              # POST /api/transcribe
│   ├── judge-question.ts          # POST /api/judge-question
│   └── docs/
│       └── index.ts               # GET /api/docs
├── shared/                        # Shared types between frontend and backend
│   └── types/
│       └── api.types.ts           # Wire format types for API
├── src/                           # Frontend React application
│   ├── components/                # React components
│   │   ├── AddYourVoice/          # Recording/upload UI
│   │   │   ├── AddYourVoiceButton.tsx
│   │   │   └── AddYourVoiceModal.tsx
│   │   ├── Audio/                 # Audio playback components
│   │   │   ├── AudioManager.tsx
│   │   │   ├── AudioPlayer.tsx
│   │   │   ├── HighlightedText.tsx
│   │   │   └── MedleyPlayer.tsx
│   │   ├── CreateAnthology/
│   │   │   └── CreateAnthologyModal.tsx
│   │   ├── Icons/
│   │   │   └── NodeIcons.tsx
│   │   ├── Map/                   # D3 visualization components
│   │   │   ├── D3Visualization.tsx
│   │   │   ├── EdgePath.tsx
│   │   │   ├── MapCanvas.tsx
│   │   │   ├── NarrativeLabelNode.tsx
│   │   │   ├── PullQuoteNode.tsx
│   │   │   ├── QuestionNode.tsx
│   │   │   └── ResponseNode.tsx
│   │   ├── Rail/                  # Right sidebar components
│   │   │   ├── CommentRail.tsx
│   │   │   ├── RailHeader.tsx
│   │   │   ├── ResizeHandle.tsx
│   │   │   ├── Components/
│   │   │   │   ├── BackButton.tsx
│   │   │   │   ├── MedleyPlayButton.tsx
│   │   │   │   ├── NarrativeTile.tsx
│   │   │   │   ├── QuestionContext.tsx
│   │   │   │   ├── QuestionTile.tsx
│   │   │   │   ├── RespondModal.tsx
│   │   │   │   ├── ResponsePlayButton.tsx
│   │   │   │   ├── ResponseTile.tsx
│   │   │   │   ├── SpeakerHeader.tsx
│   │   │   │   └── TabSwitcher.tsx
│   │   │   └── Views/
│   │   │       ├── ConversationsView.tsx
│   │   │       ├── KaraokeDisplay.tsx
│   │   │       ├── NarrativeView.tsx
│   │   │       ├── NarrativesView.tsx
│   │   │       ├── QuestionView.tsx
│   │   │       └── SingleView.tsx
│   │   └── UI/                    # Generic UI components
│   │       ├── Legend.tsx
│   │       ├── Notification.tsx
│   │       ├── PhysicsControl.tsx
│   │       ├── Tooltip.tsx
│   │       └── ViewModeToggle.tsx
│   ├── hooks/                     # Custom React hooks
│   │   ├── index.ts
│   │   ├── useD3.ts
│   │   ├── useD3Zoom.ts
│   │   ├── useD3Drag.ts
│   │   ├── useAudioManager.ts
│   │   ├── useAudioRecorder.ts
│   │   ├── useWordHighlighting.ts
│   │   └── useRecordAndTranscribe.ts
│   ├── pages/                     # Page components
│   │   ├── HomePage/
│   │   └── ViewerPage/
│   ├── services/                  # API and data services
│   │   ├── index.ts               # Service exports
│   │   ├── apiClient.ts           # Core HTTP client
│   │   ├── anthologyService.ts    # Anthology operations
│   │   ├── conversationService.ts # Conversation data
│   │   ├── questionService.ts     # Question operations
│   │   ├── responseService.ts     # Response CRUD
│   │   ├── narrativeService.ts    # Narrative operations
│   │   ├── speakerService.ts      # Speaker data
│   │   ├── graphDataService.ts    # Complete graph data loading
│   │   ├── supabaseClient.ts      # Legacy Supabase client
│   │   ├── supabaseQuery.ts       # Legacy direct queries
│   │   ├── recordingService.ts    # Audio file uploads
│   │   ├── conversationUploadService.ts
│   │   ├── adminService.ts        # Admin operations
│   │   ├── transcription.ts       # Transcription service
│   │   └── questionPlacement.ts
│   ├── stores/                    # Zustand state stores
│   │   ├── AnthologyStore.ts
│   │   ├── InteractionStore.ts
│   │   └── VisualizationStore.ts
│   ├── styles/                    # CSS styles
│   ├── types/                     # TypeScript type definitions
│   │   ├── data.types.ts          # Core data models
│   │   ├── component.types.ts     # Component props
│   │   └── store.types.ts         # Store interfaces
│   ├── utils/                     # Utility functions
│   │   ├── audioUtils.ts
│   │   ├── colorAssignment.ts
│   │   ├── dataProcessor.ts
│   │   ├── semanticLayout.ts
│   │   └── slugify.ts
│   ├── App.tsx                    # Main app component
│   ├── Root.tsx                   # Route definitions
│   └── main.tsx                   # Entry point
├── scripts/                       # Maintenance and utility scripts
│   ├── check-anthologies.ts
│   ├── check-db-schema.ts
│   ├── inspect-anthology.ts
│   └── migrate-hearst-anthology.ts
├── docs/                          # Additional documentation
├── supabase/                      # Supabase configuration
├── package.json                   # Dependencies
├── vite.config.ts                 # Vite configuration
├── vercel.json                    # Vercel deployment config
└── .env.example                   # Environment template
```

---

## REST API Architecture

The API follows RESTful conventions with standardized request/response formats.

### API Response Format

All successful responses follow this structure:
```typescript
interface ApiResponse<T> {
  data: T;
  meta?: PaginationMeta;
}

interface PaginationMeta {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}
```

All error responses follow this structure:
```typescript
interface ApiErrorResponse {
  error: {
    code: string;      // e.g., "NOT_FOUND", "BAD_REQUEST"
    message: string;
    details?: Record<string, unknown>;
  };
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `BAD_REQUEST` | 400 | Invalid request parameters |
| `VALIDATION_ERROR` | 400 | Request body validation failed |
| `UNAUTHORIZED` | 401 | Missing or invalid authentication |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `METHOD_NOT_ALLOWED` | 405 | HTTP method not supported |
| `CONFLICT` | 409 | Resource conflict |
| `INTERNAL_ERROR` | 500 | Server error |
| `DATABASE_ERROR` | 500 | Database operation failed |
| `SERVICE_UNAVAILABLE` | 503 | External service unavailable |

---

## API Endpoints

### Anthologies

#### `GET /api/anthologies`
List all anthologies (paginated).

**Query Parameters:**
- `limit` (optional, default: 50): Max items per page
- `offset` (optional, default: 0): Pagination offset
- `publicOnly` (optional, default: true): Filter to public anthologies

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "slug": "my-anthology",
      "title": "My Anthology",
      "description": "Description text",
      "isPublic": true,
      "createdAt": "2025-01-30T12:00:00Z"
    }
  ],
  "meta": { "total": 5, "limit": 50, "offset": 0, "hasMore": false }
}
```

#### `GET /api/anthologies/[slug]`
Get anthology by slug.

**Response:**
```json
{
  "data": {
    "id": "uuid",
    "slug": "my-anthology",
    "title": "My Anthology",
    "description": "Description text",
    "isPublic": true,
    "createdAt": "2025-01-30T12:00:00Z"
  }
}
```

---

### Conversations

#### `GET /api/conversations`
List conversations (paginated).

**Query Parameters:**
- `anthologyId` (optional): Filter by anthology UUID
- `limit`, `offset`: Pagination

#### `GET /api/conversations/[id]`
Get conversation by UUID.

#### `GET /api/conversations/[id]/speakers`
Get speakers for a conversation.

#### `GET /api/conversations/[id]/questions`
Get questions for a conversation.

#### `GET /api/conversations/[id]/responses`
Get responses for a conversation.

#### `GET /api/conversations/[id]/narratives`
Get narratives for a conversation.

---

### Questions

#### `GET /api/questions`
List questions (paginated).

**Query Parameters:**
- `conversationId` (optional): Filter by conversation
- `anthologyId` (optional): Filter by anthology

#### `GET /api/questions/[id]/responses`
Get responses for a specific question.

---

### Responses

#### `GET /api/responses`
List responses (paginated).

**Query Parameters:**
- `conversationId`, `anthologyId`, `questionId`, `narrativeId`, `speakerId`: Filters

#### `POST /api/responses`
Create a new response.

**Request Body:**
```json
{
  "conversationId": "uuid",
  "respondsToQuestionId": "uuid",
  "speakerName": "John Doe",
  "speakerText": "The transcript text...",
  "pullQuote": "Optional featured excerpt",
  "audioStartMs": 0,
  "audioEndMs": 5000,
  "medium": "audio",
  "synchronicity": "asynchronous"
}
```

#### `GET /api/responses/[id]`
Get response by UUID.

#### `DELETE /api/responses/[id]`
Delete a response.

#### `GET /api/responses/[id]/word-timestamps`
Get word-level timestamps for karaoke display.

**Response:**
```json
{
  "data": [
    { "text": "Hello", "start": 0, "end": 500, "confidence": 0.98 }
  ]
}
```

---

### Narratives

#### `GET /api/narratives`
List narratives (paginated).

**Query Parameters:**
- `conversationId`, `anthologyId`: Filters

#### `GET /api/narratives/[id]/responses`
Get responses assigned to a narrative.

---

### Speakers

#### `GET /api/speakers`
List speakers (paginated).

**Query Parameters:**
- `conversationId`, `anthologyId`: Filters

#### `GET /api/speakers/[id]`
Get speaker by UUID.

**Response:**
```json
{
  "data": {
    "id": "uuid",
    "anthologyId": "uuid",
    "conversationId": "uuid",
    "name": "John Doe",
    "circleColor": "#4A90E2",
    "fadedCircleColor": "rgba(74, 144, 226, 0.3)",
    "quoteRectangleColor": "#E8F1FC",
    "fadedQuoteRectangleColor": "rgba(232, 241, 252, 0.5)",
    "quoteTextColor": "#1A5DAB",
    "fadedQuoteTextColor": "rgba(26, 93, 171, 0.5)",
    "createdAt": "2025-01-30T12:00:00Z"
  }
}
```

---

### Graph Data

#### `GET /api/graph/load`
Load complete graph data for visualization. This is the main entry point for the frontend.

**Query Parameters:**
- `anthologySlug` (optional): Filter by anthology slug
- `anthologyId` (optional): Filter by anthology UUID

**Response:**
```json
{
  "data": {
    "conversations": [...],
    "questions": [...],
    "narratives": [...],
    "responses": [...]
  }
}
```

---

### AI/Sensemaking Endpoints

#### `POST /api/transcribe`
Transcribe audio using AssemblyAI.

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

#### `POST /api/judge-question`
Match a response to the best template question.

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
  "rankedQuestionIds": ["q_001", "q_002"],
  "reason": "The response directly addresses..."
}
```

#### `POST /api/sensemaking/start`
Start a sensemaking job for processing conversation audio.

#### `POST /api/sensemaking/tick`
Process the next step of a sensemaking job.

#### `GET /api/sensemaking/status?jobId=...`
Get job progress and status.

#### `POST /api/assign-narrative`
Assign a response to a narrative.

#### `POST /api/embeddings/generate`
Generate OpenAI embeddings for text.

---

## API Library (`api/_lib/`)

### `errors.ts` - Error Handling
```typescript
// Error codes
ErrorCodes.BAD_REQUEST
ErrorCodes.NOT_FOUND
ErrorCodes.VALIDATION_ERROR
// ... etc

// ApiException class for throwing standardized errors
throw new ApiException(ErrorCodes.NOT_FOUND, 'Resource not found');

// Helper functions
notFound('Conversation', id)
badRequest('Invalid parameters')
validationError('Validation failed', fieldErrors)
databaseError('Query failed', originalError)
```

### `response.ts` - Response Helpers
```typescript
// Success responses
jsonResponse(res, data)                    // 200 with { data }
createdResponse(res, data)                 // 201 with { data }
paginatedResponse(res, data, meta)         // 200 with { data, meta }
noContent(res)                             // 204 No Content

// Error responses
errorResponse(res, code, message, details)
exceptionResponse(res, apiException)
handleError(res, error)                    // Catch-all error handler
```

### `validation.ts` - Zod Schemas
```typescript
// Common schemas
uuidSchema                    // UUID validation
nonEmptyString                // Non-empty string
PaginationSchema              // { limit, offset }

// Endpoint-specific schemas
AnthologiesQuerySchema
ConversationsQuerySchema
ResponsesQuerySchema
CreateResponseSchema
UpdateResponseSchema
GraphLoadQuerySchema
// ... etc
```

### `auth.ts` - Authentication
```typescript
// Verify JWT token, returns null if no token
verifyToken(req): Promise<AuthResult | null>

// Require authentication (throws if not authenticated)
requireAuth(req): Promise<AuthResult>

// Require admin role
requireAdmin(req): Promise<AuthResult>

// Optional auth (returns null if not authenticated)
optionalAuth(req): Promise<AuthResult | null>
```

### `supabase.ts` - Database Client
```typescript
// Get Supabase client with service role key (for API routes)
getSupabase()
```

### `colorUtils.ts` - Color Generation
```typescript
// Generate color scheme for a speaker
generateSpeakerColorScheme(baseColor: string): SpeakerColorScheme
```

---

## Shared Types (`shared/types/api.types.ts`)

Types shared between frontend and backend for API wire format:

```typescript
// Response wrappers
interface ApiResponse<T> { data: T; meta?: PaginationMeta; }
interface ApiErrorResponse { error: { code: string; message: string; details?: Record<string, unknown>; }; }
interface PaginationMeta { total: number; limit: number; offset: number; hasMore: boolean; }

// Entity types (wire format - camelCase)
interface ApiAnthology { id, slug, title, description, isPublic, createdAt }
interface ApiConversation { id, legacyId, anthologyId, audioFile, duration, color, metadata, createdAt }
interface ApiQuestion { id, legacyId, conversationId, questionText, relatedResponses, ... }
interface ApiResponse { id, legacyId, conversationId, respondsToQuestionId, speakerName, speakerText, pullQuote, audioStartMs, audioEndMs, turnNumber, chronologicalTurnNumber, medium, synchronicity, embedding, wordTimestamps, ... }
interface ApiNarrative { id, legacyId, anthologyId, conversationId, narrativeText, relatedResponses, color, ... }
interface ApiSpeaker { id, anthologyId, conversationId, name, circleColor, fadedCircleColor, quoteRectangleColor, ... }
interface ApiWordTimestamp { text, start, end, speaker?, confidence? }

// Request body types
interface CreateResponseRequest { conversationId, respondsToQuestionId?, speakerName, speakerText, ... }
interface UpdateResponseRequest { speakerText?, pullQuote?, respondsToNarrativeId?, ... }
interface CreateSpeakerRequest { conversationId, name, circleColor?, ... }

// Graph data (complete visualization data)
interface ApiGraphData { conversations, questions, narratives, responses }
```

---

## Frontend Services

### API Client Services (Primary)

#### `apiClient.ts` - Core HTTP Client
```typescript
// Core methods
apiClient.get<T>(path, params?)           // GET request
apiClient.getList<T>(path, params?)       // GET with pagination
apiClient.post<T, B>(path, body)          // POST request
apiClient.patch<T, B>(path, body)         // PATCH request
apiClient.delete(path)                    // DELETE request

// Error class
class ApiError extends Error {
  code: string;
  statusCode: number;
  details?: Record<string, unknown>;
}
```

#### `graphDataService.ts` - Main Data Entry Point
```typescript
// Load complete visualization data
GraphDataService.loadAll({ anthologySlug? }): Promise<{
  conversations: Conversation[];
  questions: QuestionNode[];
  narratives: NarrativeNode[];
  responses: ResponseNode[];
}>
```

#### `anthologyService.ts`
```typescript
AnthologyService.list(params?): Promise<PaginatedResponse<ApiAnthology>>
AnthologyService.getBySlug(slug): Promise<ApiAnthology>
```

#### `conversationService.ts`
```typescript
ConversationService.list(params?)
ConversationService.getById(id)
ConversationService.getSpeakers(id)
ConversationService.getQuestions(id)
ConversationService.getResponses(id)
ConversationService.getNarratives(id)
```

#### `questionService.ts`
```typescript
QuestionService.list(params?)
QuestionService.getResponses(questionId)
```

#### `responseService.ts`
```typescript
ResponseService.list(params?)
ResponseService.create(data)
ResponseService.getById(id)
ResponseService.delete(id)
ResponseService.getWordTimestamps(id)
```

#### `narrativeService.ts`
```typescript
NarrativeService.list(params?)
NarrativeService.getResponses(narrativeId)
```

#### `speakerService.ts`
```typescript
SpeakerService.list(params?)
SpeakerService.getById(id)
```

### Legacy Supabase Services

These services are being deprecated in favor of the REST API but remain for specific use cases:

#### `supabaseClient.ts`
Direct Supabase client for real-time subscriptions.

#### `recordingService.ts`
Audio file uploads to Supabase Storage.

#### `adminService.ts`
Admin operations for adding responses.

---

## Custom Hooks

### `useD3.ts`
D3 graph initialization and lifecycle management.
```typescript
const { svgRef, simulation, nodes, edges } = useD3(graphData);
```

### `useD3Zoom.ts`
Pan and zoom controls for the graph.
```typescript
const { zoomIn, zoomOut, resetZoom, centerOnNode } = useD3Zoom(svgRef, config);
```

### `useD3Drag.ts`
Node dragging behavior.
```typescript
const { isDragging, startDrag, updateDrag, endDrag } = useD3Drag(simulation);
```

### `useAudioManager.ts`
Audio playback lifecycle management.
```typescript
const { play, pause, seek, currentTime, duration, isPlaying } = useAudioManager();
```

### `useAudioRecorder.ts`
MediaRecorder API wrapper for recording audio.
```typescript
const { startRecording, stopRecording, audioBlob, isRecording } = useAudioRecorder();
```

### `useWordHighlighting.ts`
Karaoke-style word synchronization during playback.
```typescript
const { highlightedWordIndex, words } = useWordHighlighting(wordTimestamps, currentTime);
```

### `useRecordAndTranscribe.ts`
Complete recording → upload → transcription flow.
```typescript
const { record, transcribe, isRecording, isTranscribing, result } = useRecordAndTranscribe(options);
```

---

## Core Data Types (`src/types/data.types.ts`)

### Conversation
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
  source_transcript?: string;
}
```

### Question Node
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

### Response Node
```typescript
interface ResponseNode {
  type: 'response';
  id: string;
  responds_to: string;            // Question, Response, or Narrative ID
  responds_to_narrative_id?: string;
  speaker_name: string;
  speaker_text: string;
  pull_quote?: string;            // Featured excerpt for rectangle display
  audio_start: number;            // Timestamp in ms
  audio_end: number;              // Timestamp in ms
  conversation_id: string;
  path_to_recording?: string;
  turn_number?: number;
  chronological_turn_number?: number; // Chronological order based on audio_start_ms
  word_timestamps?: WordTimestamp[];
  medium?: 'audio' | 'text';
  synchronicity?: 'sync' | 'asynchronous';
  embedding?: number[];           // 1536-dim vector for semantic layout
}
```

### Narrative Node
```typescript
interface NarrativeNode {
  type: 'narrative';
  id: string;
  narrative_text: string;
  related_responses?: string[];
  notes?: string;
  path_to_recording?: string;
}
```

### Narrative Label Node (Visual)
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

### Word Timestamp
```typescript
interface WordTimestamp {
  text: string;
  start: number;    // milliseconds
  end: number;      // milliseconds
  speaker?: string;
  confidence?: number;
}
```

### Graph Types
```typescript
type NodeType = 'question' | 'response' | 'prompt' | 'narrative' | 'narrative_label';

interface GraphNode {
  id: string;
  type: NodeType;
  data: AnthologyNode;
  x?: number;       // D3 position
  y?: number;
  fx?: number;      // Fixed position
  fy?: number;
  color?: string;
}

interface GraphEdge {
  source: string | GraphNode;
  target: string | GraphNode;
  color?: string;
  edgeType?: 'question-response' | 'chronological' | 'response-response';
}
```

### Notification
```typescript
interface Notification {
  id: string;
  type: 'info' | 'warning' | 'error' | 'success';
  message: string;
  duration?: number; // ms
}
```

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
  notifications: Notification[];
  missingEmbeddingsCount: number;
}
```

#### Selection Slice
```typescript
interface SelectionState {
  selectedNodes: Set<string>;
  hoveredNode: string | null;
  hoveredNodes: Set<string>;
  focusedNode: string | null;
  selectionMode: 'single' | 'multi' | 'question' | 'narrative';
  selectionHistory: string[][];
}
```

#### View Slice
```typescript
type RailViewMode = 'conversations' | 'question' | 'single' | 'narratives' | 'narrative';
type MapViewMode = 'narrative' | 'question';

interface ViewState {
  railExpanded: boolean;
  railWidth: number;
  railMode: RailViewMode;
  previousRailMode: RailViewMode | null;
  mapViewMode: MapViewMode;               // Controls node/edge visibility
  activeQuestion: string | null;
  activeNarrative: string | null;
  activeResponse: string | null;
  mapTransform: MapTransform;
  zoomLevel: number;
}
```

#### Audio Slice
```typescript
type PlaybackMode = 'single' | 'shuffle' | 'chronological' | 'idle';
type PlaybackState = 'idle' | 'playing' | 'paused' | 'buffering';

interface AudioState {
  playbackState: PlaybackState;
  playbackMode: PlaybackMode;
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

### VisualizationStore (`stores/VisualizationStore.ts`)

Manages D3 visualization state:
- Node positions and simulation
- Original UMAP positions
- Zoom/pan utilities
- Physics toggle
- Render flags

### InteractionStore (`stores/InteractionStore.ts`)

Manages UI interaction state:
- Drag state
- Keyboard state
- Context menu
- Tooltips

---

## Component Architecture

### Map Components (`components/Map/`)

| Component | Purpose |
|-----------|---------|
| `MapCanvas.tsx` | Main SVG container with zoom behavior |
| `D3Visualization.tsx` | Force simulation and node positioning |
| `QuestionNode.tsx` | Question node rendering (circles) |
| `ResponseNode.tsx` | Response node rendering (circles or rectangles) |
| `PullQuoteNode.tsx` | Pull quote rectangle rendering |
| `NarrativeLabelNode.tsx` | Narrative cluster label rendering |
| `EdgePath.tsx` | Connection path rendering |

### Rail Components (`components/Rail/`)

| Component | Purpose |
|-----------|---------|
| `CommentRail.tsx` | Main sidebar container |
| `RailHeader.tsx` | Header with navigation |
| `ResizeHandle.tsx` | Width adjustment handle |
| `TabSwitcher.tsx` | View mode tabs (Narratives/Questions) |

**Views:**
| View | Purpose |
|------|---------|
| `ConversationsView.tsx` | List of all conversations |
| `QuestionView.tsx` | Question with related responses |
| `NarrativesView.tsx` | List of all narratives |
| `NarrativeView.tsx` | Single narrative with responses |
| `SingleView.tsx` | Single response detail |
| `KaraokeDisplay.tsx` | Word-level highlighting |

**Components:**
| Component | Purpose |
|-----------|---------|
| `QuestionTile.tsx` | Question list item |
| `NarrativeTile.tsx` | Narrative list item |
| `ResponseTile.tsx` | Response list item |
| `ResponsePlayButton.tsx` | Single response play control |
| `MedleyPlayButton.tsx` | Multi-response play control |
| `QuestionContext.tsx` | Question context display |
| `RespondModal.tsx` | Response recording modal |
| `SpeakerHeader.tsx` | Speaker info display |
| `BackButton.tsx` | Navigation back button |

### Audio Components (`components/Audio/`)

| Component | Purpose |
|-----------|---------|
| `AudioManager.tsx` | Global audio orchestration |
| `AudioPlayer.tsx` | Playback controls UI |
| `MedleyPlayer.tsx` | Multi-track playback |
| `HighlightedText.tsx` | Synchronized word highlighting |

### UI Components (`components/UI/`)

| Component | Purpose |
|-----------|---------|
| `Legend.tsx` | Color legend display |
| `Notification.tsx` | Toast notifications |
| `PhysicsControl.tsx` | Force simulation toggle |
| `Tooltip.tsx` | Hover tooltips |
| `ViewModeToggle.tsx` | Narrative/Question view toggle |

---

## Semantic Layout & Embeddings

### 1. Embedding Generation (Backend)
- **Model**: OpenAI `text-embedding-3-small`
- **Output**: 1536-dimensional vectors
- **Content**: The `speaker_text` of each response
- **Storage**: `embedding` column in `anthology_responses`

### 2. UMAP Projection (Frontend)
- **Library**: `umap-js`
- **File**: `src/utils/semanticLayout.ts`
- **Process**: Projects 1536d vectors to 2D coordinates
- **Result**: Semantically similar responses cluster together

### 3. All or Nothing Fallback
- **Condition**: All responses must have embeddings
- **Fallback**: If any response lacks embedding, uses radial orbit layout

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
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_KEY=eyJ...
ASSEMBLYAI_API_KEY=xxx
OPENAI_API_KEY=sk-xxx
OPENAI_SENSEMAKING_MODEL=gpt-4o-mini
```

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
The Vite dev server proxies `/api/*` to local Vercel functions.

### Maintenance Scripts
Located in `scripts/`:
- `check-anthologies.ts`: Verify count of data nodes per anthology
- `check-db-schema.ts`: Validate table columns and constraints
- `inspect-anthology.ts`: Dump data for a specific anthology slug
- `migrate-hearst-anthology.ts`: Historical migration utility

Run using `npx tsx scripts/<filename>.ts`.

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `src/App.tsx` | Main application component |
| `src/services/apiClient.ts` | Core HTTP client for API |
| `src/services/graphDataService.ts` | Main data loading service |
| `src/stores/AnthologyStore.ts` | Main state management |
| `src/components/Map/D3Visualization.tsx` | Force simulation |
| `src/components/Audio/AudioManager.tsx` | Audio orchestration |
| `shared/types/api.types.ts` | Shared API types |
| `api/_lib/errors.ts` | API error handling |
| `api/_lib/response.ts` | API response helpers |
| `api/_lib/validation.ts` | Request validation schemas |
| `api/graph/load.ts` | Main data endpoint |

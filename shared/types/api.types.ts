/**
 * Shared API Types
 * Types used by both frontend and API endpoints
 * These match the wire format for API requests/responses
 */

// ================== Common Types ==================

/**
 * Pagination metadata returned by list endpoints
 */
export interface PaginationMeta {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

/**
 * Standard API success response
 */
export interface ApiResponse<T> {
  data: T;
  meta?: PaginationMeta;
}

/**
 * Standard API error response
 */
export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

// ================== Anthology Types ==================

/**
 * Anthology summary for list views
 */
export interface ApiAnthology {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  isPublic: boolean;
  createdAt: string;
}

// ================== Conversation Types ==================

/**
 * Speaker color scheme
 */
export interface ApiSpeakerColorScheme {
  circle: string;
  fadedCircle: string;
  quoteRectangle: string;
  fadedQuoteRectangle: string;
  quoteText: string;
  fadedQuoteText: string;
}

/**
 * Conversation metadata
 */
export interface ApiConversationMetadata {
  title?: string;
  date?: string;
  participants: string[];
  speakerColors?: Record<string, string | ApiSpeakerColorScheme>;
  location?: string;
  facilitator?: string;
  topics?: string[];
  sourceTranscript?: string;
  colorScheme?: string;
}

/**
 * Full conversation data
 */
export interface ApiConversation {
  id: string;
  legacyId: string | null;
  anthologyId: string;
  audioFile: string;
  duration: number;
  color: string;
  metadata: ApiConversationMetadata;
  createdAt: string;
}

// ================== Speaker Types ==================

/**
 * Speaker data
 */
export interface ApiSpeaker {
  id: string;
  anthologyId: string;
  conversationId: string;
  name: string;
  circleColor: string;
  fadedCircleColor: string;
  quoteRectangleColor: string;
  fadedQuoteRectangleColor: string;
  quoteTextColor: string;
  fadedQuoteTextColor: string;
  createdAt: string;
}

// ================== Question Types ==================

/**
 * Question node data
 */
export interface ApiQuestion {
  id: string;
  legacyId: string | null;
  conversationId: string;
  questionText: string;
  relatedResponses: string[];
  facilitator?: string;
  notes?: string;
  pathToRecording?: string;
  audioStartMs?: number;
  audioEndMs?: number;
  createdAt: string;
}

// ================== Response Types ==================

/**
 * Word timestamp for karaoke highlighting
 */
export interface ApiWordTimestamp {
  text: string;
  start: number;
  end: number;
  speaker?: string;
  confidence?: number;
}

/**
 * Response node data
 */
export interface ApiResponseNode {
  id: string;
  legacyId: string | null;
  conversationId: string;
  respondsToQuestionId: string | null;
  respondsToResponseId: string | null;
  respondsToNarrativeId: string | null;
  speakerName: string;
  speakerText: string;
  pullQuote: string | null;
  audioStartMs: number | null;
  audioEndMs: number | null;
  turnNumber: number | null;
  chronologicalTurnNumber: number | null;
  pathToRecording?: string;
  medium: 'audio' | 'text' | null;
  synchronicity: 'sync' | 'asynchronous' | null;
  embedding?: number[];
  wordTimestamps?: ApiWordTimestamp[];
  createdAt: string;
}

/**
 * Request body for creating a response
 */
export interface CreateResponseRequest {
  conversationId: string;
  respondsToQuestionId?: string;
  respondsToResponseId?: string;
  respondsToNarrativeId?: string;
  speakerName: string;
  speakerText: string;
  pullQuote?: string;
  audioStartMs?: number;
  audioEndMs?: number;
  turnNumber?: number;
  medium?: 'audio' | 'text';
  synchronicity?: 'sync' | 'asynchronous';
}

/**
 * Request body for updating a response
 */
export interface UpdateResponseRequest {
  speakerText?: string;
  pullQuote?: string | null;
  respondsToNarrativeId?: string | null;
  audioStartMs?: number;
  audioEndMs?: number;
}

// ================== Narrative Types ==================

/**
 * Narrative node data
 */
export interface ApiNarrative {
  id: string;
  legacyId: string | null;
  anthologyId: string;
  conversationId: string;
  narrativeText: string;
  relatedResponses: string[];
  notes?: string;
  color?: string;
  embedding?: number[];
  createdAt: string;
}

// ================== Graph Load Types ==================

/**
 * Complete graph data for visualization
 * Returned by GET /api/graph/load
 */
export interface ApiGraphData {
  conversations: ApiConversation[];
  questions: ApiQuestion[];
  narratives: ApiNarrative[];
  responses: ApiResponseNode[];
}

// ================== Request Body Types ==================

/**
 * Request body for creating a speaker
 */
export interface CreateSpeakerRequest {
  conversationId: string;
  name: string;
  circleColor?: string;
  fadedCircleColor?: string;
  quoteRectangleColor?: string;
  fadedQuoteRectangleColor?: string;
  quoteTextColor?: string;
  fadedQuoteTextColor?: string;
}

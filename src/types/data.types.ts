/**
 * Core data types for Anthology visualization
 * Based on the JSON structure and Design.md specifications
 */

// ================== Conversation Types ==================

/**
 * Color scheme for a speaker with separate colors for different visual states
 */
export interface SpeakerColorScheme {
  circle: string; // Circle node selected state
  fadedCircle: string; // Circle node faded state
  quoteRectangle: string; // Pull quote background selected state
  fadedQuoteRectangle: string; // Pull quote background faded state
  quoteText: string; // Pull quote text selected state
  fadedQuoteText: string; // Pull quote text faded state (includes opacity)
}

export interface ConversationMetadata {
  title?: string;
  date?: string;
  participants: string[];
  speaker_colors?: Record<string, string | SpeakerColorScheme>; // speaker name → color or color scheme
  location?: string;
  facilitator?: string;
  topics?: string[];
  source_transcript?: string;
  color_scheme?: string;
}

export interface Conversation {
  conversation_id: string;
  audio_file: string;
  duration: number; // in milliseconds
  color: string; // hex color value
  metadata: ConversationMetadata;
}

// ================== Node Types ==================

export type NodeType = 'question' | 'response' | 'prompt' | 'narrative' | 'narrative_label';

export interface QuestionNode {
  type: 'question';
  id: string;
  question_text: string;
  related_responses: string[]; // Array of response node IDs
  facilitator?: string;
  notes?: string;
  path_to_recording?: string;
}

export interface ResponseNode {
  type: 'response';
  id: string;
  responds_to: string; // Question node ID or parent response ID
  responds_to_narrative_id?: string; // UUID - narrative node ID if responding to narrative
  speaker_name: string;
  speaker_text: string;
  pull_quote?: string; // If present, node displays as rectangle
  audio_start: number; // timestamp in milliseconds
  audio_end: number; // timestamp in milliseconds
  conversation_id: string; // Reference to parent conversation
  /** Optional: when a response has its own standalone recording (not a segment of the conversation audio). */
  path_to_recording?: string;
  /** Optional ordering metadata (used by DB-backed datasets). */
  turn_number?: number;
  /** Optional: Chronological order for sensemaking responses only (NULL for user-added). Based on audio_start_ms. */
  chronological_turn_number?: number;
  word_timestamps?: WordTimestamp[]; // For word-level highlighting
  /** Optional: OpenAI text embedding for semantic positioning (1536-dim vector) */
  embedding?: number[];
  /** Response medium: 'audio' or 'text'. Used for visual differentiation. */
  medium?: 'audio' | 'text';
  /** Response synchronicity: 'sync' (from batch upload) or 'asynchronous' (user-added). Used for visual differentiation. */
  synchronicity?: 'sync' | 'asynchronous';
}

export interface PromptNode {
  type: 'prompt';
  id: string;
  responds_to?: string;
  speaker_name: string;
  speaker_text: string;
  audio_start?: number;
  audio_end?: number;
  conversation_id?: string;
}

export interface NarrativeNode {
  type: 'narrative';
  id: string;
  narrative_text: string;
  /** Optional: Narratives might behave like questions and have responses, or be standalone. For now assuming they might have related content or just be standalone nodes. */
  related_responses?: string[];
  notes?: string;
  path_to_recording?: string;
}

export interface NarrativeLabelNode {
  type: 'narrative_label';
  id: string; // e.g., "narrative_label_N1"
  narrative_id: string; // e.g., "N1"
  narrative_name: string; // e.g., "The Silicon Valley Illusion"
  narrative_color: string; // Assigned from palette
  centroid_x: number; // Calculated position
  centroid_y: number; // Calculated position
}

export type AnthologyNode = QuestionNode | ResponseNode | PromptNode | NarrativeNode | NarrativeLabelNode;

// ================== Audio Types ==================

export interface WordTimestamp {
  text: string;
  start: number; // milliseconds
  end: number; // milliseconds
  speaker?: string;
  confidence?: number;
}

export interface AudioSegment {
  start: number;
  end: number;
  conversation_id: string;
  audio_file: string;
}

// ================== Graph Types ==================

export interface GraphNode {
  id: string;
  type: NodeType;
  data: AnthologyNode;
  x?: number; // Position (managed by D3)
  y?: number; // Position (managed by D3)
  fx?: number; // Fixed position
  fy?: number; // Fixed position
  color?: string; // Inherited from conversation
}

export type EdgeType = 'question-response' | 'chronological' | 'response-response';

export interface GraphEdge {
  source: string | GraphNode;
  target: string | GraphNode;
  color?: string; // Inherited from response node's conversation
  edgeType?: EdgeType; // Type for filtering in different view modes
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ================== Visual State Types ==================

export interface NodeVisualState {
  selected: boolean;
  hovered: boolean;
  playing: boolean;
  opacity: number;
  scale: number;
}

export interface MapTransform {
  x: number;
  y: number;
  k: number; // zoom scale
}

// ================== Data Collection Type ==================

export interface AnthologyData {
  conversations: Conversation[];
  questions: QuestionNode[];
  narratives: NarrativeNode[];
  responses: ResponseNode[];
  prompts?: PromptNode[]; // These won't be visualized but stored for context
}

// ================== Notification Types ==================

export interface Notification {
  id: string;
  type: 'info' | 'warning' | 'error' | 'success';
  message: string;
  duration?: number; // ms, optional
}

// ================== Processed Types ==================

export interface ProcessedNode extends GraphNode {
  conversation?: Conversation; // Associated conversation data
  visualState: NodeVisualState;
}

export interface DataState {
  rawData: AnthologyData | null;
  nodes: Map<string, GraphNode>;
  edges: Map<string, GraphEdge>;
  questionNodes: Map<string, QuestionNode>;
  narrativeNodes: Map<string, NarrativeNode>;
  responseNodes: Map<string, ResponseNode>;
  conversations: Map<string, Conversation>;
  colorAssignments: Map<string, ColorAssignment>;
  speakerColorAssignments: Map<string, SpeakerColorAssignment>;
  isLoading: boolean;
  loadError: string | null;
  notifications: Notification[];
  missingEmbeddingsCount: number;
}

export interface ProcessedEdge extends GraphEdge {
  id: string; // Unique edge identifier
  curveData?: string; // SVG path data for curved edge
}

// ================== Color Assignment ==================

export interface ColorAssignment {
  conversation_id: string;
  color: string;
  index: number;
}

export interface SpeakerColorAssignment {
  speaker_name: string;
  conversation_id: string;
  color: string | SpeakerColorScheme; // Support both old and new formats
  index: number;
}

// ================== Selection Types ==================

export interface SelectionState {
  selectedNodes: Set<string>; // Node IDs
  hoveredNode: string | null;
  hoveredNodes: Set<string>; // For multi-node hover (e.g., hovering narrative highlights all responses)
  focusedNode: string | null;
  selectionMode: 'single' | 'multi' | 'question' | 'narrative';
  selectionHistory: string[][]; // For undo/redo
}

// ================== View State Types ==================

export type RailViewMode = 'conversations' | 'question' | 'single' | 'narratives' | 'narrative';
export type MapViewMode = 'narrative' | 'question';

export interface ViewState {
  railExpanded: boolean;
  railWidth: number;
  railMode: RailViewMode;
  previousRailMode: RailViewMode | null; // Track where we navigated from for back button
  mapViewMode: MapViewMode; // Controls which nodes/edges are visible on the map
  activeQuestion: string | null;
  activeNarrative: string | null;
  activeResponse: string | null;
  mapTransform: MapTransform;
  zoomLevel: number;
}

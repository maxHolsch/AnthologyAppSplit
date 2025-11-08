/**
 * Core data types for Anthology visualization
 * Based on the JSON structure and Design.md specifications
 */

// ================== Conversation Types ==================

export interface ConversationMetadata {
  title?: string;
  date?: string;
  participants: string[];
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

export type NodeType = 'question' | 'response' | 'prompt';

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
  speaker_name: string;
  speaker_text: string;
  pull_quote?: string; // If present, node displays as rectangle
  audio_start: number; // timestamp in milliseconds
  audio_end: number; // timestamp in milliseconds
  conversation_id: string; // Reference to parent conversation
  word_timestamps?: WordTimestamp[]; // For word-level highlighting
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

export type AnthologyNode = QuestionNode | ResponseNode | PromptNode;

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

export interface GraphEdge {
  source: string | GraphNode;
  target: string | GraphNode;
  color?: string; // Inherited from response node's conversation
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
  responses: ResponseNode[];
  prompts?: PromptNode[]; // These won't be visualized but stored for context
}

// ================== Processed Types ==================

export interface ProcessedNode extends GraphNode {
  conversation?: Conversation; // Associated conversation data
  visualState: NodeVisualState;
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

// ================== Selection Types ==================

export interface SelectionState {
  selectedNodes: Set<string>; // Node IDs
  hoveredNode: string | null;
  focusedNode: string | null;
  selectionMode: 'single' | 'multi' | 'question';
  selectionHistory: string[][]; // For undo/redo
}

// ================== View State Types ==================

export type RailViewMode = 'conversations' | 'question' | 'single';

export interface ViewState {
  railExpanded: boolean;
  railWidth: number;
  railMode: RailViewMode;
  activeQuestion: string | null;
  activeResponse: string | null;
  mapTransform: MapTransform;
  zoomLevel: number;
}
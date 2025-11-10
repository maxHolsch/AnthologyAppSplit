/**
 * Zustand store types for Anthology
 * Based on Design.md state management architecture
 */

import type {
  AnthologyData,
  Conversation,
  QuestionNode,
  ResponseNode,
  GraphNode,
  GraphEdge,
  SelectionState,
  ViewState,
  MapTransform,
  ColorAssignment,
  SpeakerColorAssignment,
  RailViewMode
} from './data.types';

// ================== Audio Store Types ==================

export type PlaybackMode = 'single' | 'shuffle' | 'chronological' | 'idle';
export type PlaybackState = 'idle' | 'playing' | 'paused' | 'buffering';

export interface AudioState {
  // Playback state
  playbackState: PlaybackState;
  playbackMode: PlaybackMode;
  currentTrack: string | null; // Node ID being played
  currentTime: number; // Current playback position in ms
  duration: number; // Total duration of current segment

  // Audio element reference
  audioElement: HTMLAudioElement | null;

  // Playlist management
  playlist: string[]; // Queue of node IDs
  playlistIndex: number;

  // Settings
  volume: number; // 0-1
  playbackSpeed: number; // 0.5-2

  // Node highlighting sync
  highlightedWord: number | null; // Index of currently highlighted word
}

export interface AudioActions {
  play: (nodeId: string) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  seek: (time: number) => void;
  setVolume: (volume: number) => void;
  setPlaybackSpeed: (speed: number) => void;
  playNext: () => void;
  playPrevious: () => void;
  shufflePlay: (nodeIds: string[]) => void;
  updateCurrentTime: (time: number) => void;
  setAudioElement: (element: HTMLAudioElement) => void;
  clearPlayback: () => void;
}

// ================== Data Store Types ==================

export interface DataState {
  // Raw data
  rawData: AnthologyData | null;

  // Processed graph data
  nodes: Map<string, GraphNode>;
  edges: Map<string, GraphEdge>;

  // Lookup maps for quick access
  questionNodes: Map<string, QuestionNode>;
  responseNodes: Map<string, ResponseNode>;

  // Conversation data
  conversations: Map<string, Conversation>;
  colorAssignments: Map<string, ColorAssignment>; // Kept for backward compatibility
  speakerColorAssignments: Map<string, SpeakerColorAssignment>; // Speaker colors keyed by "conversationId:speakerName"

  // Loading state
  isLoading: boolean;
  loadError: string | null;
}

export interface DataActions {
  loadData: (data: AnthologyData) => Promise<void>;
  processData: () => void;
  assignColors: () => void;
  getNodeById: (id: string) => GraphNode | undefined;
  getEdgeById: (id: string) => GraphEdge | undefined;
  getResponsesForQuestion: (questionId: string) => ResponseNode[];
  getConversationForNode: (nodeId: string) => Conversation | undefined;
  clearData: () => void;
}

// ================== Selection Store Types ==================

export interface SelectionActions {
  selectNode: (nodeId: string, mode?: 'single' | 'multi') => void;
  selectQuestion: (questionId: string) => void;
  selectResponse: (responseId: string) => void;
  clearSelection: () => void;
  hoverNode: (nodeId: string | null) => void;
  focusNode: (nodeId: string | null) => void;
  addToSelection: (nodeId: string) => void;
  removeFromSelection: (nodeId: string) => void;
  toggleSelection: (nodeId: string) => void;
  undoSelection: () => void;
  redoSelection: () => void;
  isNodeSelected: (nodeId: string) => boolean;
}

// ================== View Store Types ==================

export interface ViewActions {
  setRailExpanded: (expanded: boolean) => void;
  toggleRail: () => void;
  setRailWidth: (width: number) => void;
  setRailMode: (mode: RailViewMode) => void;
  setActiveQuestion: (questionId: string | null) => void;
  setActiveResponse: (responseId: string | null) => void;
  setMapTransform: (transform: MapTransform) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  panTo: (x: number, y: number) => void;
  centerOnNode: (nodeId: string) => void;
}

// ================== Combined Store Types ==================

export interface AnthologyStore {
  // Data slice
  data: DataState & DataActions;

  // Selection slice
  selection: SelectionState & SelectionActions;

  // View slice
  view: ViewState & ViewActions;

  // Audio slice
  audio: AudioState & AudioActions;
}

// ================== Visualization Store Types ==================

export interface VisualizationState {
  // D3 references (not part of React state)
  simulation: any | null; // D3 ForceSimulation instance
  simulationNodes: GraphNode[]; // D3-mutated node array with positions
  svgRef: SVGSVGElement | null;
  containerRef: SVGGElement | null;

  // Zoom utilities
  centerOnNode: ((nodeX: number, nodeY: number, targetScale?: number, duration?: number) => void) | null;

  // Render flags
  needsUpdate: boolean;
  isSimulating: boolean;
  tickCount: number; // Increments on each simulation tick to force re-renders

  // Performance
  renderFrameRate: number;
  nodeCount: number;
  edgeCount: number;
}

export interface VisualizationActions {
  initSimulation: (nodes: GraphNode[], edges: GraphEdge[], width?: number, height?: number) => void;
  updateSimulation: () => void;
  stopSimulation: () => void;
  restartSimulation: () => void;
  setSvgRef: (ref: SVGSVGElement | null) => void;
  setContainerRef: (ref: SVGGElement | null) => void;
  setNeedsUpdate: (needsUpdate: boolean) => void;
  requestUpdate: () => void;
  updateComplete: () => void;
  getNodePosition: (nodeId: string) => { x: number; y: number } | null;
  setCenterOnNode: (fn: ((nodeX: number, nodeY: number, targetScale?: number, duration?: number) => void) | null) => void;
}

export interface VisualizationStore extends VisualizationState, VisualizationActions {}

// ================== Interaction Store Types ==================

export interface InteractionState {
  // Drag state
  isDragging: boolean;
  draggedNode: string | null;
  dragStartPos: { x: number; y: number } | null;

  // Keyboard state
  keysPressed: Set<string>;

  // Context menu
  contextMenuOpen: boolean;
  contextMenuPos: { x: number; y: number } | null;
  contextMenuNode: string | null;

  // Tool tips
  tooltipNode: string | null;
  tooltipPos: { x: number; y: number } | null;
  tooltipContent: string | null;
  tooltipTimeout: NodeJS.Timeout | null;
}

export interface InteractionActions {
  startDrag: (nodeId: string, pos: { x: number; y: number }) => void;
  updateDrag: (pos: { x: number; y: number }) => void;
  endDrag: () => void;

  keyDown: (key: string) => void;
  keyUp: (key: string) => void;
  clearKeys: () => void;

  openContextMenu: (nodeId: string, pos: { x: number; y: number }) => void;
  closeContextMenu: () => void;

  showTooltip: (content: string, x: number, y: number, nodeId?: string) => void;
  hideTooltip: () => void;
}

export interface InteractionStore extends InteractionState, InteractionActions {}
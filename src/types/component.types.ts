/**
 * Component prop types for Anthology
 */

import type {
  QuestionNode,
  ResponseNode,
  GraphNode,
  GraphEdge,
  Conversation,
  MapTransform
} from './data.types';

// ================== Map Component Props ==================

export interface MapCanvasProps {
  width?: number;
  height?: number;
  className?: string;
}

export interface NodeProps {
  node: GraphNode;
  onClick?: (node: GraphNode) => void;
  onMouseEnter?: (node: GraphNode) => void;
  onMouseLeave?: (node: GraphNode) => void;
}

export interface QuestionNodeProps extends NodeProps {
  semanticZoom?: number; // Scale factor for text size
}

export interface ResponseNodeProps extends NodeProps {
  conversation?: Conversation;
}

export interface PullQuoteNodeProps extends NodeProps {
  pullQuote?: string;
}

export interface EdgePathProps {
  edge: GraphEdge;
  sourceNode: GraphNode;
  targetNode: GraphNode;
  opacity: number;
  color: string;
}

// ================== Rail Component Props ==================

export interface RailContainerProps {
  width?: number;
  isExpanded?: boolean;
  onResize?: (width: number) => void;
  className?: string;
}

export interface ConversationsViewProps {
  questions: QuestionNode[];
  onQuestionClick: (questionId: string) => void;
  onPlayHighlights?: () => void;
}

export interface QuestionViewProps {
  question: QuestionNode;
  responses: ResponseNode[];
  onResponseClick: (responseId: string) => void;
  onBack: () => void;
  onPlayMedley?: () => void;
}

export interface SingleNodeViewProps {
  response: ResponseNode;
  question?: QuestionNode;
  onBack: () => void;
  onPlay?: () => void;
}

export interface QuestionTileProps {
  question: QuestionNode;
  responseCount: number;
  onClick: () => void;
  isActive?: boolean;
}

export interface ResponseTileProps {
  response: ResponseNode;
  conversation?: Conversation;
  onClick: () => void;
  onPlay?: () => void;
  isActive?: boolean;
  isPlaying?: boolean;
}

// ================== Audio Component Props ==================

export interface PlayButtonProps {
  isPlaying: boolean;
  duration?: number;
  currentTime?: number;
  onClick: () => void;
  variant?: 'small' | 'medium' | 'large';
  showDuration?: boolean;
  className?: string;
  disabled?: boolean;
}

export interface ProgressBarProps {
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  isPlaying?: boolean;
  className?: string;
}

export interface WordHighlighterProps {
  text: string;
  wordTimestamps?: Array<{
    text: string;
    start: number;
    end: number;
  }>;
  currentTime: number;
  className?: string;
}

export interface AudioPlayerProps {
  nodeId: string;
  audioFile: string;
  startTime: number;
  endTime: number;
  onPlay?: () => void;
  onPause?: () => void;
  onEnd?: () => void;
  onTimeUpdate?: (time: number) => void;
}

// ================== Common Component Props ==================

export interface SpeakerBadgeProps {
  name: string;
  color: string;
  size?: 'small' | 'medium' | 'large';
  className?: string;
}

export interface BackButtonProps {
  onClick: () => void;
  label?: string;
  className?: string;
}

export interface LoadingProps {
  message?: string;
  fullScreen?: boolean;
  className?: string;
}

export interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<{ error: Error }>;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

// ================== Layout Component Props ==================

export interface AppLayoutProps {
  children?: React.ReactNode;
}

export interface MapContainerProps {
  children?: React.ReactNode;
  transform?: MapTransform;
  onTransformChange?: (transform: MapTransform) => void;
}

export interface RailLayoutProps {
  children?: React.ReactNode;
  width?: number;
  minWidth?: number;
  maxWidth?: number | string;
}

// ================== Control Component Props ==================

export interface ZoomControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  currentZoom?: number;
  minZoom?: number;
  maxZoom?: number;
  className?: string;
}

export interface ConversationFilterProps {
  conversations: Conversation[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  className?: string;
}

// ================== Utility Types ==================

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Rect extends Point, Size {}

export interface BezierCurve {
  start: Point;
  control1: Point;
  control2: Point;
  end: Point;
}
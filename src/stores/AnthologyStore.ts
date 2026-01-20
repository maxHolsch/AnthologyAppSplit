/**
 * Main Anthology Store - manages application state
 * Implements the store architecture from Design.md
 */

import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import type {
  AnthologyData,
  Conversation,
  ResponseNode,
  GraphNode,
  GraphEdge,
  SelectionState,
  ViewState,
  MapTransform,
  ColorAssignment,
  SpeakerColorAssignment,
  RailViewMode,
  MapViewMode,
  Notification
} from '@types';
import type {
  DataState,
  AudioState
} from '@types';
import { useVisualizationStore } from './VisualizationStore';
import { calculateSemanticPositions } from '@utils/semanticLayout';
import { createLogger } from '@utils';
import { assignSpeakerColors } from '@/utils/colorAssignment';

// Create namespaced logger for this store
const logger = createLogger('AnthologyStore');

// Default color palette for conversations
const DEFAULT_COLORS = [
  '#4A90E2', // Blue
  '#FF5F1F', // Orange
  '#6CC686', // Green
  '#CC82E7', // Purple
  '#F7ACEA', // Pink
  '#6CB7FA', // Light Blue
  '#FFB84D', // Gold
  '#7B68EE', // Medium Slate Blue
  '#FF6B6B', // Coral
  '#4ECDC4', // Turquoise
];

// Helper function to assign colors to conversations
const assignConversationColors = (conversations: Conversation[]): Map<string, ColorAssignment> => {
  const assignments = new Map<string, ColorAssignment>();

  conversations.forEach((conv, index) => {
    // Use existing color if provided, otherwise assign from palette
    const color = conv.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length];
    assignments.set(conv.conversation_id, {
      conversation_id: conv.conversation_id,
      color,
      index
    });
  });

  return assignments;
};

// Note: Speaker color assignment now uses the canonical function from utils/colorAssignment
// with the DEFAULT_COLORS palette to maintain existing color scheme

// Helper function to assign colors to narratives
const assignNarrativeColors = (narrativeIds: string[]): Map<string, string> => {
  const assignments = new Map<string, string>();

  narrativeIds.forEach((narrativeId, index) => {
    const color = DEFAULT_COLORS[index % DEFAULT_COLORS.length];
    assignments.set(narrativeId, color);
  });

  return assignments;
};

// Helper function to calculate centroid position for a narrative based on its responses
const calculateNarrativeCentroid = (
  narrativeId: string,
  responses: ResponseNode[],
  nodesMap: Map<string, GraphNode>
): { x: number; y: number } | null => {
  // Filter responses that belong to this narrative
  const narrativeResponses = responses.filter(
    r => r.responds_to_narrative_id === narrativeId
  );

  if (narrativeResponses.length === 0) {
    return null; // No responses, no centroid
  }

  // Get positions of all response nodes
  const positions: { x: number; y: number }[] = [];

  narrativeResponses.forEach(response => {
    const node = nodesMap.get(response.id);
    if (node && typeof node.x === 'number' && typeof node.y === 'number') {
      positions.push({ x: node.x, y: node.y });
    }
  });

  if (positions.length === 0) {
    return null; // No valid positions
  }

  // Calculate average (centroid)
  const sumX = positions.reduce((sum, pos) => sum + pos.x, 0);
  const sumY = positions.reduce((sum, pos) => sum + pos.y, 0);

  const centroid = {
    x: sumX / positions.length,
    y: sumY / positions.length
  };

  // Debug logging for this specific narrative (only shown in development)
  logger.debug(`Narrative ${narrativeId}:`);
  logger.debug(`  - Found ${narrativeResponses.length} responses`);
  logger.debug(`  - Valid positions: ${positions.length}`);
  logger.debug(`  - Position range: x[${Math.min(...positions.map(p => p.x)).toFixed(2)} to ${Math.max(...positions.map(p => p.x)).toFixed(2)}], y[${Math.min(...positions.map(p => p.y)).toFixed(2)} to ${Math.max(...positions.map(p => p.y)).toFixed(2)}]`);
  logger.debug(`  - Calculated centroid:`, centroid);

  return centroid;
};

interface AnthologyStoreState {
  // Data slice
  data: DataState;

  // Selection slice
  selection: SelectionState;

  // View slice
  view: ViewState;

  // Audio slice
  audio: AudioState;
}

interface AnthologyStoreActions {
  // Data actions
  loadData: (data: AnthologyData) => Promise<void>;
  processData: () => void;
  getNodeById: (id: string) => GraphNode | undefined;
  getResponsesForQuestion: (questionId: string) => ResponseNode[];
  getConversationForNode: (nodeId: string) => Conversation | undefined;
  clearData: () => void;

  // Notification actions
  addNotification: (type: Notification['type'], message: string, duration?: number) => void;
  dismissNotification: (id: string) => void;

  // Selection actions
  selectNode: (nodeId: string, mode?: 'single' | 'multi') => void;
  selectQuestion: (questionId: string) => void;
  selectResponse: (responseId: string) => void;
  clearSelection: () => void;
  hoverNode: (nodeId: string | null) => void;
  isNodeSelected: (nodeId: string) => boolean;

  // View actions
  setRailExpanded: (expanded: boolean) => void;
  toggleRail: () => void;
  setRailMode: (mode: RailViewMode) => void;
  setRailWidth: (width: number) => void;
  setMapViewMode: (mode: MapViewMode) => void;
  setActiveQuestion: (questionId: string | null) => void;
  setActiveResponse: (responseId: string | null) => void;
  setMapTransform: (transform: MapTransform) => void;
  centerOnNode: (nodeId: string) => void;
  zoomToFullMap: () => void;

  // Audio actions
  setAudioElement: (element: HTMLAudioElement | null) => void;
  play: (nodeId: string) => void;
  pause: () => void;
  stop: () => void;
  seek: (time: number) => void;
  setVolume: (volume: number) => void;
  shufflePlay: (nodeIds: string[]) => void;
  updateCurrentTime: (time: number) => void;
  setPlaybackSpeed: (speed: number) => void;
}

export const useAnthologyStore = create<AnthologyStoreState & AnthologyStoreActions>()(
  devtools(
    subscribeWithSelector((set, get) => ({
      // ============ Initial State ============

      // Data slice
      data: {
        rawData: null,
        nodes: new Map(),
        edges: new Map(),
        questionNodes: new Map(),
        narrativeNodes: new Map(),
        responseNodes: new Map(),
        conversations: new Map(),
        colorAssignments: new Map(),
        speakerColorAssignments: new Map(),
        narrativeColorAssignments: new Map(),
        isLoading: false,
        loadError: null,
        notifications: [],
        missingEmbeddingsCount: 0
      },

      // Selection slice
      selection: {
        selectedNodes: new Set(),
        hoveredNode: null,
        hoveredNodes: new Set(),
        focusedNode: null,
        selectionMode: 'single',
        selectionHistory: []
      },

      // View slice
      view: {
        railExpanded: true,
        railWidth: 380,
        railMode: 'narratives',
        previousRailMode: null,
        mapViewMode: 'narrative',
        activeQuestion: null,
        activeNarrative: null,
        activeResponse: null,
        mapTransform: { x: 0, y: 0, k: 1 },
        zoomLevel: 1
      },

      // Audio slice
      audio: {
        playbackState: 'idle',
        playbackMode: 'single',
        currentTrack: null,
        currentTime: 0,
        duration: 0,
        audioElement: null,
        playlist: [],
        playlistIndex: 0,
        volume: 1,
        playbackSpeed: 1,
        highlightedWord: null
      },

      // ============ Data Actions ============

      loadData: async (data: AnthologyData) => {

        // Prevent unnecessary reloads if data is already loaded and identical
        // For now just logging, but this is a likely candidate for optimization

        set((state) => ({
          data: {
            ...state.data,
            isLoading: true,
            loadError: null
          }
        }));

        try {
          // Store raw data
          const questionMap = new Map(data.questions.map(q => [q.id, q]));
          // Optional: handle if narratives is undefined (should be empty array from service)
          const narrativeMap = new Map((data.narratives || []).map(n => [n.id, n]));
          const responseMap = new Map(data.responses.map(r => [r.id, r]));
          const conversationMap = new Map(data.conversations.map(c => [c.conversation_id, c]));

          // Assign colors to conversations and speakers
          const colorAssignments = assignConversationColors(data.conversations);
          const speakerColorAssignments = assignSpeakerColors(data.conversations, DEFAULT_COLORS);

          // Assign colors to narratives
          const narrativeIds = Array.from(narrativeMap.keys());
          const narrativeColorAssignments = assignNarrativeColors(narrativeIds);

          // Create graph nodes with fixed positions based on UMAP embeddings
          const nodes = new Map<string, GraphNode>();
          const idAliases = new Map<string, string>(); // db uuid -> canonical node id
          const questionRadius = 300;

          // Combine questions and narratives for layout
          // Narratives are treated as anchor nodes similar to questions
          const combinedAnchors = [...data.questions, ...(data.narratives || [])];

          combinedAnchors.forEach((node, index) => {
            const angle = (index / Math.max(combinedAnchors.length, 1)) * 2 * Math.PI;
            const x = Math.cos(angle) * questionRadius;
            const y = Math.sin(angle) * questionRadius;

            // Determine type based on properties (safe check since we combined types)
            const type = (node as any).narrative_text !== undefined ? 'narrative' : 'question';

            nodes.set(node.id, {
              id: node.id,
              type: type as 'question' | 'narrative',
              data: node as any,
              x,
              y,
              fx: x,
              fy: y
            });

            const dbId = (node as any)?._db_id;
            if (typeof dbId === 'string' && dbId.length > 0) {
              idAliases.set(dbId, node.id);
            }
          });

          // Collect response nodes and check if they have embeddings
          const responses = data.responses.filter(r => r.type === 'response');
          const responsesWithEmbeddings = responses.filter(
            r => Array.isArray(r.embedding) && r.embedding.length > 0
          );

          const missingCount = responses.length - responsesWithEmbeddings.length;

          // Apply UMAP positioning if we have at least 2 embeddings
          let semanticPositions = new Map<string, { x: number; y: number }>();

          if (responsesWithEmbeddings.length >= 2) {
            try {
              const embeddings = responsesWithEmbeddings.map(r => r.embedding!);
              const positions = calculateSemanticPositions(embeddings, 500);

              // Map positions back to response IDs
              responsesWithEmbeddings.forEach((r, idx) => {
                semanticPositions.set(r.id, positions[idx]);
              });

              console.log('[AnthologyStore] Applied UMAP semantic positioning to', responsesWithEmbeddings.length, 'response nodes');

              if (missingCount > 0) {
                console.warn(`[AnthologyStore] ${missingCount} embeddings are missing.`);
              }
            } catch (error) {
              console.warn('[AnthologyStore] Failed to calculate semantic positions:', error);
            }
          }

          // Add response nodes with positions (UMAP or fallback)
          responses.forEach((response) => {
            // Use narrative color instead of speaker color
            const narrativeId = response.responds_to_narrative_id;
            const narrativeColor = narrativeId
              ? narrativeColorAssignments.get(narrativeId)
              : null;

            // Priority: narrative color > grey fallback
            const color = narrativeColor || '#999999';

            let x = 0, y = 0;
            const semanticPos = semanticPositions.get(response.id);

            if (semanticPos) {
              // Use UMAP position
              x = semanticPos.x;
              y = semanticPos.y;
            } else {
              // Fallback: position around parent question in orbit
              const parentNode = nodes.get(response.responds_to);
              if (parentNode && parentNode.x !== undefined && parentNode.y !== undefined) {
                const responseRadius = 100;
                // Use the response index for deterministic orbit positioning
                const rIndex = responses.indexOf(response);
                const angle = (rIndex / Math.max(responses.length, 1)) * 2 * Math.PI;
                x = parentNode.x + Math.cos(angle) * responseRadius;
                y = parentNode.y + Math.sin(angle) * responseRadius;
              }
            }

            nodes.set(response.id, {
              id: response.id,
              type: 'response',
              data: response,
              color,
              x,
              y,
              // Start pinned (static UMAP) until physics is manually unlocked
              fx: x,
              fy: y
            });

            const dbId = (response as any)?._db_id;
            if (typeof dbId === 'string' && dbId.length > 0) {
              idAliases.set(dbId, response.id);
            }
          });

          // Generate narrative label nodes after responses are positioned
          // This must happen AFTER response nodes have positions (from UMAP or fallback)
          narrativeIds.forEach(narrativeId => {
            const centroid = calculateNarrativeCentroid(
              narrativeId,
              responses,
              nodes
            );

            console.log('[loadData] Narrative', narrativeId, 'centroid:', centroid);

            if (centroid) {
              // Get narrative name from the narrative data
              const narrativeData = narrativeMap.get(narrativeId);
              const narrativeName = narrativeData?.narrative_text || narrativeId;
              const narrativeColor = narrativeColorAssignments.get(narrativeId) || DEFAULT_COLORS[0];

              console.log('[loadData] Creating label node at centroid:', centroid);

              const labelNodeId = `narrative_label_${narrativeId}`;
              const labelNode: any = {
                type: 'narrative_label',
                id: labelNodeId,
                narrative_id: narrativeId,
                narrative_name: narrativeName,
                narrative_color: narrativeColor,
                centroid_x: centroid.x,
                centroid_y: centroid.y
              };

              nodes.set(labelNodeId, {
                id: labelNodeId,
                type: 'narrative_label',
                data: labelNode,
                x: centroid.x,
                y: centroid.y,
                fx: centroid.x,
                fy: centroid.y,
                color: narrativeColor
              });
            }
          });

          // Create graph edges
          const edges = new Map<string, GraphEdge>();

          data.responses.forEach(response => {
            if (response.type === 'response' && response.responds_to) {
              const color = colorAssignments.get(response.conversation_id)?.color;

              // Handle both single string and array of question IDs
              const respondsToArray = Array.isArray(response.responds_to)
                ? response.responds_to
                : [response.responds_to];

              respondsToArray.forEach(targetId => {
                const resolvedTargetId = nodes.has(targetId)
                  ? targetId
                  : (idAliases.get(targetId) || targetId);

                if (!nodes.has(resolvedTargetId)) {
                  // If we still can't resolve the target, skip creating an edge.
                  // This prevents invisible edges filtered out later by VisualizationStore.
                  console.warn('Skipping edge: target node not found', {
                    sourceId: response.id,
                    targetId: targetId,
                    resolvedTargetId,
                  });
                  return;
                }

                // Determine edge type based on target node type
                // - question-response: response -> question
                // - response-response: async response -> another response (visible in both views)
                const targetNode = nodes.get(resolvedTargetId);
                const edgeType = targetNode?.type === 'response' ? 'response-response' : 'question-response';

                // Direction: new response -> the node it responds to
                // (so the arrow head lands on the parent node)
                const edgeId = `${response.id}-${resolvedTargetId}`;
                edges.set(edgeId, {
                  source: response.id,
                  target: resolvedTargetId,
                  color,
                  edgeType
                });
              });
            }
          });

          // Create chronological edges (green) between consecutive chronological_turn_number
          // Group responses by conversation
          const responsesByConversation = new Map<string, ResponseNode[]>();
          let responsesWithChrono = 0;
          data.responses.forEach(response => {
            if (response.type === 'response' && typeof response.chronological_turn_number === 'number') {
              responsesWithChrono++;
              const existing = responsesByConversation.get(response.conversation_id) || [];
              existing.push(response);
              responsesByConversation.set(response.conversation_id, existing);
            }
          });

          console.log(`[AnthologyStore] Found ${responsesWithChrono} responses with chronological_turn_number out of ${data.responses.length} total`);

          // Sort each group by chronological_turn_number and create green edges
          let chronoEdgesCreated = 0;
          responsesByConversation.forEach((conversationResponses, convId) => {
            const sorted = conversationResponses.sort((a, b) =>
              (a.chronological_turn_number ?? 0) - (b.chronological_turn_number ?? 0)
            );

            console.log(`[AnthologyStore] Conversation ${convId}: ${sorted.length} chronological responses`);
            // console.log(`[AnthologyStore] IDs:`, sorted.map(r => `${r.id}(${r.chronological_turn_number})`).join(', '));

            for (let i = 0; i < sorted.length - 1; i++) {
              const current = sorted[i];
              const next = sorted[i + 1];
              const edgeId = `chrono-${current.id}-${next.id}`;

              edges.set(edgeId, {
                source: current.id,
                target: next.id,
                color: '#22C55E', // Green for chronological edges
                edgeType: 'chronological'
              });
              chronoEdgesCreated++;
            }
          });
          console.log(`[AnthologyStore] Created ${chronoEdgesCreated} chronological edges`);

          set((state) => ({
            data: {
              ...state.data,
              rawData: data,
              nodes,
              edges,
              questionNodes: questionMap,
              narrativeNodes: narrativeMap,
              responseNodes: responseMap,
              conversations: conversationMap,
              colorAssignments,
              speakerColorAssignments,
              narrativeColorAssignments,
              missingEmbeddingsCount: missingCount,
              isLoading: false
            }
          }));

        } catch (error) {
          set((state) => ({
            data: {
              ...state.data,
              isLoading: false,
              loadError: error instanceof Error ? error.message : 'Failed to load data'
            }
          }));
        }
      },

      addNotification: (type, message, duration = 5000) => {
        const id = Math.random().toString(36).substring(2, 9);
        set((state) => ({
          data: {
            ...state.data,
            notifications: [...state.data.notifications, { id, type, message, duration }]
          }
        }));
      },

      dismissNotification: (id) => {
        set((state) => ({
          data: {
            ...state.data,
            notifications: state.data.notifications.filter(n => n.id !== id)
          }
        }));
      },

      processData: () => {
        // Additional data processing if needed
        // This is called after loadData to perform any additional transformations
      },

      getNodeById: (id: string) => {
        return get().data.nodes.get(id);
      },

      getResponsesForQuestion: (questionId: string) => {
        const question = get().data.questionNodes.get(questionId);
        if (!question) return [];

        return question.related_responses
          .map(id => get().data.responseNodes.get(id))
          .filter((r): r is ResponseNode => r !== undefined);
      },

      getResponsesForNarrative: (narrativeId: string) => {
        const allResponses = get().data.responseNodes;
        const narrativeResponses: ResponseNode[] = [];

        allResponses.forEach(response => {
          if (response.responds_to_narrative_id === narrativeId) {
            narrativeResponses.push(response);
          }
        });

        return narrativeResponses;
      },

      getNarrativesWithResponses: () => {
        const narrativeMap = get().data.narrativeNodes;
        const narrativeColorMap = get().data.narrativeColorAssignments;
        const getResponsesForNarrative = get().getResponsesForNarrative;

        const narrativesWithResponses: Array<{
          id: string;
          name: string;
          color: string;
          responses: ResponseNode[];
        }> = [];

        narrativeMap.forEach((narrative, narrativeId) => {
          const responses = getResponsesForNarrative(narrativeId);
          const name = narrative.narrative_text || narrativeId;
          const color = narrativeColorMap.get(narrativeId) || DEFAULT_COLORS[0];

          // Only include narratives that have responses
          if (responses.length > 0) {
            narrativesWithResponses.push({
              id: narrativeId,
              name,
              color,
              responses
            });
          }
        });

        return narrativesWithResponses;
      },

      getConversationForNode: (nodeId: string) => {
        const node = get().data.nodes.get(nodeId);
        if (!node || node.type !== 'response') return undefined;

        const response = node.data as ResponseNode;
        return get().data.conversations.get(response.conversation_id);
      },

      clearData: () => {
        set((state) => ({
          data: {
            rawData: null,
            nodes: new Map(),
            edges: new Map(),
            questionNodes: new Map(),
            narrativeNodes: new Map(),
            responseNodes: new Map(),
            conversations: new Map(),
            colorAssignments: new Map(),
            speakerColorAssignments: new Map(),
            narrativeColorAssignments: new Map(),
            isLoading: false,
            loadError: null,
            notifications: [],
            missingEmbeddingsCount: 0
          },
          selection: {
            ...state.selection,
            selectedNodes: new Set(),
            hoveredNode: null,
            hoveredNodes: new Set(),
            focusedNode: null
          }
        }));
      },

      // ============ Selection Actions ============

      selectNode: (nodeId: string, mode = 'single') => {
        const node = get().data.nodes.get(nodeId);
        if (!node) return;

        set((state) => {
          const newSelection = mode === 'multi'
            ? new Set(state.selection.selectedNodes)
            : new Set<string>();

          newSelection.add(nodeId);

          // Update selection history
          const newHistory = [...state.selection.selectionHistory];
          newHistory.push(Array.from(newSelection));

          return {
            selection: {
              ...state.selection,
              selectedNodes: newSelection,
              selectionMode: mode,
              selectionHistory: newHistory
            }
          };
        });
      },

      selectQuestion: (questionId: string) => {
        const question = get().data.questionNodes.get(questionId);
        if (!question) return;

        // Select the question and all its responses
        const relatedNodeIds = [questionId, ...question.related_responses];

        set((state) => ({
          selection: {
            ...state.selection,
            selectedNodes: new Set(relatedNodeIds),
            selectionMode: 'question',
            focusedNode: questionId
          },
          view: {
            ...state.view,
            railMode: 'question',
            activeQuestion: questionId,
            activeResponse: null
          }
        }));

        // Stop any current playback when switching focus
        get().stop();

        // Auto-zoom to question node
        const vizStore = useVisualizationStore.getState();
        const position = vizStore.getNodePosition(questionId);
        const centerOnNode = vizStore.centerOnNode;

        if (position && centerOnNode) {
          // Zoom to 1.5x scale for better focus on question and responses
          centerOnNode(position.x, position.y, 1.5, 750);
        }
      },

      selectNarrative: (narrativeId: string) => {
        const getResponsesForNarrative = get().getResponsesForNarrative;
        const responses = getResponsesForNarrative(narrativeId);

        if (responses.length === 0) {
          console.warn('No responses found for narrative:', narrativeId);
          return;
        }

        // Select the narrative label node, all its responses, and connected questions
        const narrativeLabelNodeId = `narrative_label_${narrativeId}`;
        const narrativeResponseIds = responses.map(r => r.id);

        // Find all questions connected to these responses
        const { edges, responseNodes } = get().data;
        const connectedQuestionIds = new Set<string>();
        edges.forEach(edge => {
          const sourceId = typeof edge.source === 'string' ? edge.source : edge.source?.id;
          const targetId = typeof edge.target === 'string' ? edge.target : edge.target?.id;

          // Check if response is source or target
          if (narrativeResponseIds.includes(sourceId)) {
            // Source is a narrative response, target might be a question
            const targetNode = responseNodes.get(targetId);
            if (!targetNode) {
              // It's a question node
              connectedQuestionIds.add(targetId);
            }
          } else if (narrativeResponseIds.includes(targetId)) {
            // Target is a narrative response, source might be a question
            const sourceNode = responseNodes.get(sourceId);
            if (!sourceNode) {
              // It's a question node
              connectedQuestionIds.add(sourceId);
            }
          }
        });

        const relatedNodeIds = [narrativeLabelNodeId, ...narrativeResponseIds, ...Array.from(connectedQuestionIds)];

        set((state) => ({
          selection: {
            ...state.selection,
            selectedNodes: new Set(relatedNodeIds),
            selectionMode: 'narrative',
            focusedNode: narrativeLabelNodeId
          },
          view: {
            ...state.view,
            railMode: 'narrative',
            activeNarrative: narrativeId,
            activeQuestion: null,
            activeResponse: null
          }
        }));

        // Stop any current playback when switching focus
        get().stop();

        // Auto-zoom to fit all narrative responses in view
        const vizStore = useVisualizationStore.getState();
        const centerOnNode = vizStore.centerOnNode;

        console.log('[selectNarrative] narrativeId:', narrativeId);
        console.log('[selectNarrative] responses.length:', responses.length);
        console.log('[selectNarrative] centerOnNode function exists:', !!centerOnNode);

        if (!centerOnNode) {
          console.error('[selectNarrative] centerOnNode function not available!');
          return;
        }

        if (responses.length === 0) {
          console.error('[selectNarrative] No responses to zoom to!');
          return;
        }

        // Calculate bounding box of all response nodes + narrative label
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        let validPositions = 0;

        // Include all response positions
        responses.forEach(response => {
          const pos = vizStore.getNodePosition(response.id);
          console.log('[selectNarrative] Response', response.id, 'position:', pos);
          if (pos) {
            minX = Math.min(minX, pos.x);
            maxX = Math.max(maxX, pos.x);
            minY = Math.min(minY, pos.y);
            maxY = Math.max(maxY, pos.y);
            validPositions++;
          }
        });

        // Include narrative label position
        const labelPos = vizStore.getNodePosition(narrativeLabelNodeId);
        console.log('[selectNarrative] Label position:', labelPos);
        if (labelPos) {
          minX = Math.min(minX, labelPos.x);
          maxX = Math.max(maxX, labelPos.x);
          minY = Math.min(minY, labelPos.y);
          maxY = Math.max(maxY, labelPos.y);
          validPositions++;
        }

        console.log('[selectNarrative] Valid positions found:', validPositions);
        console.log('[selectNarrative] Bounding box:', { minX, maxX, minY, maxY });

        if (validPositions === 0) {
          console.error('[selectNarrative] No valid positions found - cannot zoom!');
          return;
        }

        // Calculate center and required zoom to fit
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const width = maxX - minX;
        const height = maxY - minY;

        console.log('[selectNarrative] Calculated dimensions:', { centerX, centerY, width, height });

        // Calculate zoom level to fit (assume viewport ~1000x800, add padding)
        const padding = 100; // pixels of padding around the group
        const viewportWidth = 1000;
        const viewportHeight = 800;
        const scaleX = (viewportWidth - padding * 2) / Math.max(width, 1);
        const scaleY = (viewportHeight - padding * 2) / Math.max(height, 1);
        const targetScale = Math.min(scaleX, scaleY, 1.5); // Cap at 1.5x max

        console.log('[selectNarrative] Calculated scales:', { scaleX, scaleY, targetScale });
        console.log('[selectNarrative] Calling centerOnNode with:', { centerX, centerY, targetScale });

        try {
          centerOnNode(centerX, centerY, targetScale, 750);
          console.log('[selectNarrative] centerOnNode called successfully');
        } catch (error) {
          console.error('[selectNarrative] Error calling centerOnNode:', error);
        }
      },

      selectResponse: (responseId: string) => {
        const currentRailMode = get().view.railMode;
        console.log('[selectResponse] Current railMode:', currentRailMode, '-> Setting previousRailMode');

        set((state) => ({
          selection: {
            ...state.selection,
            selectedNodes: new Set([responseId]),
            selectionMode: 'single',
            focusedNode: responseId
          },
          view: {
            ...state.view,
            previousRailMode: currentRailMode, // Save where we came from
            railMode: 'single',
            activeResponse: responseId
          }
        }));

        // Stop any current playback when switching focus
        get().stop();

        // Auto-zoom to response node
        const vizStore = useVisualizationStore.getState();
        const position = vizStore.getNodePosition(responseId);
        const centerOnNode = vizStore.centerOnNode;

        if (position && centerOnNode) {
          // Zoom to 2x scale for focused view on individual response
          centerOnNode(position.x, position.y, 2.0, 750);
        }
      },

      clearSelection: () => {
        // Stop any current playback
        get().stop();

        set((state) => ({
          selection: {
            ...state.selection,
            selectedNodes: new Set(),
            hoveredNodes: new Set(),
            focusedNode: null
          },
          view: {
            ...state.view,
            railMode: 'conversations',
            previousRailMode: null,
            activeQuestion: null,
            activeNarrative: null,
            activeResponse: null
          }
        }));
      },

      hoverNode: (nodeId: string | null) => {
        set((state) => ({
          selection: {
            ...state.selection,
            hoveredNode: nodeId
          }
        }));
      },

      hoverNodes: (nodeIds: string[]) => {
        set((state) => ({
          selection: {
            ...state.selection,
            hoveredNodes: new Set(nodeIds)
          }
        }));
      },

      isNodeSelected: (nodeId: string) => {
        return get().selection.selectedNodes.has(nodeId);
      },

      // ============ View Actions ============

      setRailExpanded: (expanded: boolean) => {
        set((state) => ({
          view: {
            ...state.view,
            railExpanded: expanded
          }
        }));
      },

      toggleRail: () => {
        set((state) => ({
          view: {
            ...state.view,
            railExpanded: !state.view.railExpanded
          }
        }));
      },

      setRailMode: (mode: RailViewMode) => {
        set((state) => ({
          view: {
            ...state.view,
            railMode: mode
          }
        }));
      },

      setMapViewMode: (mode: MapViewMode) => {
        const visualizationStore = useVisualizationStore.getState();

        if (mode === 'question') {
          // Question view: enable physics with stronger forces
          visualizationStore.setForceStrengths('question');
          if (!visualizationStore.isPhysicsEnabled) {
            visualizationStore.togglePhysics();
          }
        } else {
          // Narrative view: restore original UMAP positions and weaker forces
          visualizationStore.setForceStrengths('narrative');
          visualizationStore.restoreOriginalPositions();
        }

        // Clear selection when switching view modes
        get().clearSelection();

        set((state) => ({
          view: {
            ...state.view,
            mapViewMode: mode
          }
        }));
      },

      setRailWidth: (width: number) => {
        // Constrain width between 320px and 50vw
        const maxWidth = window.innerWidth * 0.5;
        const constrainedWidth = Math.max(320, Math.min(width, maxWidth));

        set((state) => ({
          view: {
            ...state.view,
            railWidth: constrainedWidth
          }
        }));
      },

      setActiveQuestion: (questionId: string | null) => {
        set((state) => ({
          view: {
            ...state.view,
            activeQuestion: questionId,
            railMode: questionId ? 'question' : 'conversations'
          }
        }));
      },

      setActiveNarrative: (narrativeId: string | null) => {
        set((state) => ({
          view: {
            ...state.view,
            activeNarrative: narrativeId,
            railMode: narrativeId ? 'narrative' : 'narratives'
          }
        }));
      },

      setActiveResponse: (responseId: string | null) => {
        set((state) => ({
          view: {
            ...state.view,
            activeResponse: responseId,
            railMode: responseId ? 'single' : 'conversations'
          }
        }));
      },

      setMapTransform: (transform: MapTransform) => {
        set((state) => ({
          view: {
            ...state.view,
            mapTransform: transform,
            zoomLevel: transform.k
          }
        }));
      },

      centerOnNode: (nodeId: string) => {
        // This will be implemented when we have the D3 visualization
        // It will calculate the transform needed to center on the node
        console.log('Center on node:', nodeId);
      },

      zoomToFullMap: () => {
        // Reset zoom to show full map - calls the resetZoom function from D3 zoom hook
        const vizStore = useVisualizationStore.getState();
        const resetZoom = vizStore.resetZoom;

        if (resetZoom) {
          resetZoom(750); // 750ms smooth animation
        }
      },

      // ============ Audio Actions ============

      setAudioElement: (element: HTMLAudioElement | null) => {
        set((state) => ({
          audio: {
            ...state.audio,
            audioElement: element
          }
        }));
      },

      play: (nodeId: string) => {
        const node = get().data.responseNodes.get(nodeId);
        if (!node) {
          console.warn('[AnthologyStore.play] Node not found:', nodeId);
          return;
        }

        // Debug: Log the node being played to diagnose audio sync issues
        console.log('[AnthologyStore.play] Playing node:', {
          nodeId,
          audio_start: node.audio_start,
          audio_end: node.audio_end,
          durationMs: node.audio_end - node.audio_start,
          textPreview: node.speaker_text?.slice(0, 80) + (node.speaker_text?.length > 80 ? '...' : ''),
          path_to_recording: node.path_to_recording,
        });

        set((state) => ({
          audio: {
            ...state.audio,
            playbackState: 'playing',
            playbackMode: 'single',
            currentTrack: nodeId,
            duration: node.audio_end - node.audio_start,
            currentTime: 0
          }
        }));
      },

      pause: () => {
        set((state) => ({
          audio: {
            ...state.audio,
            playbackState: 'paused'
          }
        }));
      },

      stop: () => {
        set((state) => ({
          audio: {
            ...state.audio,
            playbackState: 'idle',
            currentTrack: null,
            currentTime: 0,
            duration: 0
          }
        }));
      },

      seek: (time: number) => {
        set((state) => ({
          audio: {
            ...state.audio,
            currentTime: Math.max(0, Math.min(time, state.audio.duration))
          }
        }));
      },

      setVolume: (volume: number) => {
        const clampedVolume = Math.max(0, Math.min(1, volume));
        const audioElement = get().audio.audioElement;

        if (audioElement) {
          audioElement.volume = clampedVolume;
        }

        set((state) => ({
          audio: {
            ...state.audio,
            volume: clampedVolume
          }
        }));
      },

      shufflePlay: (nodeIds: string[]) => {
        if (nodeIds.length === 0) return;

        // Randomly select a node from the list
        const randomIndex = Math.floor(Math.random() * nodeIds.length);
        const randomNodeId = nodeIds[randomIndex];

        get().play(randomNodeId);

        set((state) => ({
          audio: {
            ...state.audio,
            playbackMode: 'shuffle',
            playlist: nodeIds,
            playlistIndex: randomIndex
          }
        }));
      },

      updateCurrentTime: (time: number) => {
        set((state) => ({
          audio: {
            ...state.audio,
            currentTime: time
          }
        }));
      },

      setPlaybackSpeed: (speed: number) => {
        const clampedSpeed = Math.max(0.5, Math.min(2, speed));
        const audioElement = get().audio.audioElement;

        if (audioElement) {
          audioElement.playbackRate = clampedSpeed;
        }

        set((state) => ({
          audio: {
            ...state.audio,
            playbackSpeed: clampedSpeed
          }
        }));
      }
    })),
    {
      name: 'anthology-store'
    }
  )
);

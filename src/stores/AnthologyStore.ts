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
  Notification
} from '@types';
import type {
  DataState,
  AudioState
} from '@types';
import { useVisualizationStore } from './VisualizationStore';
import { calculateSemanticPositions } from '@utils/semanticLayout';

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

// Helper function to assign colors to speakers within conversations
const assignSpeakerColorsFromConversations = (
  conversations: Conversation[]
): Map<string, SpeakerColorAssignment> => {
  const assignments = new Map<string, SpeakerColorAssignment>();

  conversations.forEach((conv) => {
    const speakerColors = conv.metadata.speaker_colors || {};
    const participants = conv.metadata.participants || [];

    participants.forEach((speaker, index) => {
      // Use color from metadata if available, otherwise assign from palette
      const color = speakerColors[speaker] || DEFAULT_COLORS[index % DEFAULT_COLORS.length];
      const key = `${conv.conversation_id}:${speaker}`;

      assignments.set(key, {
        speaker_name: speaker,
        conversation_id: conv.conversation_id,
        color,
        index
      });
    });
  });

  return assignments;
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
        isLoading: false,
        loadError: null,
        notifications: [],
        missingEmbeddingsCount: 0
      },

      // Selection slice
      selection: {
        selectedNodes: new Set(),
        hoveredNode: null,
        focusedNode: null,
        selectionMode: 'single',
        selectionHistory: []
      },

      // View slice
      view: {
        railExpanded: true,
        railWidth: 380,
        railMode: 'conversations',
        activeQuestion: null,
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
          const speakerColorAssignments = assignSpeakerColorsFromConversations(data.conversations);

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
                get().addNotification('warning', 'warning, some embeddings are missing');
              }
            } catch (error) {
              console.warn('[AnthologyStore] Failed to calculate semantic positions:', error);
            }
          }

          // Add response nodes with positions (UMAP or fallback)
          responses.forEach((response) => {
            // Use speaker color instead of conversation color
            const speakerColorKey = `${response.conversation_id}:${response.speaker_name}`;
            const colorValue = speakerColorAssignments.get(speakerColorKey)?.color;

            // Normalize color to string - extract 'circle' if it's a SpeakerColorScheme object
            const color = typeof colorValue === 'string' ? colorValue : colorValue?.circle;

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

          // Create graph edges
          const edges = new Map<string, GraphEdge>();

          data.responses.forEach(response => {
            if (response.type === 'response' && response.responds_to) {
              const color = colorAssignments.get(response.conversation_id)?.color;

              // Handle both single string and array of question IDs
              const respondsToArray = Array.isArray(response.responds_to)
                ? response.responds_to
                : [response.responds_to];

              respondsToArray.forEach(questionId => {
                const resolvedTargetId = nodes.has(questionId)
                  ? questionId
                  : (idAliases.get(questionId) || questionId);

                if (!nodes.has(resolvedTargetId)) {
                  // If we still can't resolve the target, skip creating an edge.
                  // This prevents invisible edges filtered out later by VisualizationStore.
                  console.warn('Skipping edge: target node not found', {
                    sourceId: response.id,
                    targetId: questionId,
                    resolvedTargetId,
                  });
                  return;
                }

                // Direction: new response -> the node it responds to
                // (so the arrow head lands on the parent node)
                const edgeId = `${response.id}-${resolvedTargetId}`;
                edges.set(edgeId, {
                  source: response.id,
                  target: resolvedTargetId,
                  color
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
                color: '#22C55E' // Green for chronological edges
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
            isLoading: false,
            loadError: null,
            notifications: [],
            missingEmbeddingsCount: 0
          },
          selection: {
            ...state.selection,
            selectedNodes: new Set(),
            hoveredNode: null,
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

      selectResponse: (responseId: string) => {
        set((state) => ({
          selection: {
            ...state.selection,
            selectedNodes: new Set([responseId]),
            selectionMode: 'single',
            focusedNode: responseId
          },
          view: {
            ...state.view,
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
            focusedNode: null
          },
          view: {
            ...state.view,
            railMode: 'conversations',
            activeQuestion: null,
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

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
  RailViewMode
} from '@types';
import type {
  DataState,
  AudioState
} from '@types';

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
  loadData: (data: AnthologyData, viewportWidth?: number, viewportHeight?: number) => Promise<void>;
  processData: () => void;
  getNodeById: (id: string) => GraphNode | undefined;
  getResponsesForQuestion: (questionId: string) => ResponseNode[];
  getConversationForNode: (nodeId: string) => Conversation | undefined;
  clearData: () => void;

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
  setActiveQuestion: (questionId: string | null) => void;
  setActiveResponse: (responseId: string | null) => void;
  setMapTransform: (transform: MapTransform) => void;
  centerOnNode: (nodeId: string) => void;

  // Audio actions
  play: (nodeId: string) => void;
  pause: () => void;
  stop: () => void;
  seek: (time: number) => void;
  setVolume: (volume: number) => void;
  shufflePlay: (nodeIds: string[]) => void;
  updateCurrentTime: (time: number) => void;
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
        responseNodes: new Map(),
        conversations: new Map(),
        colorAssignments: new Map(),
        isLoading: false,
        loadError: null
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

      loadData: async (data: AnthologyData, viewportWidth?: number, viewportHeight?: number) => {
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
          const responseMap = new Map(data.responses.map(r => [r.id, r]));
          const conversationMap = new Map(data.conversations.map(c => [c.conversation_id, c]));

          // Assign colors to conversations
          const colorAssignments = assignConversationColors(data.conversations);

          // Calculate center position (default to 400x300 if not provided)
          const centerX = viewportWidth ? viewportWidth / 2 : 400;
          const centerY = viewportHeight ? viewportHeight / 2 : 300;

          // Create graph nodes with adaptive radial initial positions
          const nodes = new Map<string, GraphNode>();

          // Calculate adaptive radial positions for questions to prevent overlap
          const questionCount = data.questions.length;
          const questionCollisionRadius = 100; // Match VisualizationStore collision radius

          // Calculate minimum radius needed to prevent question overlap
          // Circumference = questionCount × (2 × collisionRadius) for minimum spacing
          const minCircumference = questionCount * (2 * questionCollisionRadius);
          const minRadius = minCircumference / (2 * Math.PI);

          // Use larger of calculated min radius or 40% of viewport
          const baseQuestionRadius = Math.min(centerX, centerY) * 0.4;
          const questionRadius = Math.max(minRadius, baseQuestionRadius);

          // Add question nodes with adaptive radial distribution
          data.questions.forEach((question, qIndex) => {
            const angle = (qIndex / data.questions.length) * 2 * Math.PI;
            const qx = centerX + Math.cos(angle) * questionRadius;
            const qy = centerY + Math.sin(angle) * questionRadius;

            nodes.set(question.id, {
              id: question.id,
              type: 'question',
              data: question,
              x: qx,
              y: qy
            });
          });

          // Add response nodes positioned around their questions with adaptive spacing
          data.responses.forEach(response => {
            if (response.type === 'response') {
              const color = colorAssignments.get(response.conversation_id)?.color;

              // Find parent question
              const parentQuestionId = response.responds_to;
              const parentQuestion = nodes.get(parentQuestionId);

              let x, y;
              if (parentQuestion && parentQuestion.x !== undefined && parentQuestion.y !== undefined) {
                // Position response around its parent question
                const questionResponses = data.responses.filter(r =>
                  r.type === 'response' && r.responds_to === parentQuestionId
                );
                const responseIndex = questionResponses.findIndex(r => r.id === response.id);
                const responseCount = questionResponses.length;
                const angle = (responseIndex / responseCount) * 2 * Math.PI;

                // Adaptive response radius - scale up for many responses to prevent overlap
                // Base radius 150px, add extra spacing for dense connections (>6 responses)
                const baseResponseRadius = 150;
                const responseRadius = baseResponseRadius + (responseCount > 6 ? responseCount * 10 : 0);

                x = parentQuestion.x + Math.cos(angle) * responseRadius;
                y = parentQuestion.y + Math.sin(angle) * responseRadius;
              } else {
                // Orphan responses: distribute across viewport instead of clustering at center
                const orphanIndex = Array.from(nodes.values()).filter(n =>
                  n.type === 'response' && !data.questions.find(q =>
                    q.id === (n.data as ResponseNode).responds_to
                  )
                ).length;

                const orphanAngle = (orphanIndex / Math.max(data.responses.length, 1)) * 2 * Math.PI;
                const orphanRadius = Math.min(centerX, centerY) * 0.6; // Distribute at 60% radius

                x = centerX + Math.cos(orphanAngle) * orphanRadius;
                y = centerY + Math.sin(orphanAngle) * orphanRadius;
              }

              nodes.set(response.id, {
                id: response.id,
                type: 'response',
                data: response,
                color,
                x,
                y
              });
            }
          });

          // Create graph edges
          const edges = new Map<string, GraphEdge>();

          data.responses.forEach(response => {
            if (response.type === 'response') {
              const edgeId = `${response.responds_to}-${response.id}`;
              const color = colorAssignments.get(response.conversation_id)?.color;

              edges.set(edgeId, {
                source: response.responds_to,
                target: response.id,
                color
              });
            }
          });

          set((state) => ({
            data: {
              ...state.data,
              rawData: data,
              nodes,
              edges,
              questionNodes: questionMap,
              responseNodes: responseMap,
              conversations: conversationMap,
              colorAssignments,
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
            responseNodes: new Map(),
            conversations: new Map(),
            colorAssignments: new Map(),
            isLoading: false,
            loadError: null
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
      },

      clearSelection: () => {
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

      // ============ Audio Actions ============

      play: (nodeId: string) => {
        const node = get().data.responseNodes.get(nodeId);
        if (!node) return;

        set((state) => ({
          audio: {
            ...state.audio,
            playbackState: 'playing',
            playbackMode: 'single',
            currentTrack: nodeId,
            duration: node.audio_end - node.audio_start
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
            currentTime: time
          }
        }));
      },

      setVolume: (volume: number) => {
        set((state) => ({
          audio: {
            ...state.audio,
            volume: Math.max(0, Math.min(1, volume))
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
      }
    })),
    {
      name: 'anthology-store'
    }
  )
);
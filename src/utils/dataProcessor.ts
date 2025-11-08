/**
 * Data processing utilities for transforming JSON data into graph structure
 */

import type {
  AnthologyData,
  QuestionNode,
  ResponseNode,
  GraphNode,
  GraphEdge,
  ColorAssignment
} from '@types';

/**
 * Validates the incoming data structure
 */
export const validateAnthologyData = (data: any): AnthologyData => {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid data: expected an object');
  }

  if (!Array.isArray(data.conversations)) {
    throw new Error('Invalid data: missing conversations array');
  }

  if (!Array.isArray(data.questions)) {
    throw new Error('Invalid data: missing questions array');
  }

  if (!Array.isArray(data.responses)) {
    throw new Error('Invalid data: missing responses array');
  }

  // Validate conversations
  data.conversations.forEach((conv: any, index: number) => {
    if (!conv.conversation_id) {
      throw new Error(`Invalid conversation at index ${index}: missing conversation_id`);
    }
    if (!conv.audio_file) {
      throw new Error(`Invalid conversation ${conv.conversation_id}: missing audio_file`);
    }
  });

  // Validate questions
  data.questions.forEach((question: any, index: number) => {
    if (!question.id) {
      throw new Error(`Invalid question at index ${index}: missing id`);
    }
    if (!question.question_text) {
      throw new Error(`Invalid question ${question.id}: missing question_text`);
    }
    if (!Array.isArray(question.related_responses)) {
      throw new Error(`Invalid question ${question.id}: related_responses must be an array`);
    }
  });

  // Validate responses
  data.responses.forEach((response: any, index: number) => {
    if (!response.id) {
      throw new Error(`Invalid response at index ${index}: missing id`);
    }
    if (!response.type) {
      throw new Error(`Invalid response ${response.id}: missing type`);
    }
    if (response.type === 'response') {
      if (!response.responds_to) {
        throw new Error(`Invalid response ${response.id}: missing responds_to`);
      }
      if (!response.conversation_id) {
        throw new Error(`Invalid response ${response.id}: missing conversation_id`);
      }
      if (response.audio_start === undefined || response.audio_end === undefined) {
        throw new Error(`Invalid response ${response.id}: missing audio timestamps`);
      }
    }
  });

  return data as AnthologyData;
};

/**
 * Filters out prompt nodes and returns only response nodes
 */
export const filterResponseNodes = (nodes: any[]): ResponseNode[] => {
  return nodes.filter(node => node.type === 'response') as ResponseNode[];
};

/**
 * Creates a mapping of question IDs to their response nodes
 */
export const createQuestionResponseMap = (
  questions: QuestionNode[],
  responses: ResponseNode[]
): Map<string, ResponseNode[]> => {
  const map = new Map<string, ResponseNode[]>();

  questions.forEach(question => {
    const relatedResponses = question.related_responses
      .map(id => responses.find(r => r.id === id))
      .filter((r): r is ResponseNode => r !== undefined);

    map.set(question.id, relatedResponses);
  });

  return map;
};

/**
 * Creates graph nodes from questions and responses
 */
export const createGraphNodes = (
  questions: QuestionNode[],
  responses: ResponseNode[],
  colorAssignments: Map<string, ColorAssignment>
): GraphNode[] => {
  const nodes: GraphNode[] = [];

  // Add question nodes
  questions.forEach(question => {
    nodes.push({
      id: question.id,
      type: 'question',
      data: question
    });
  });

  // Add response nodes
  responses.forEach(response => {
    const color = colorAssignments.get(response.conversation_id)?.color;
    nodes.push({
      id: response.id,
      type: 'response',
      data: response,
      color
    });
  });

  return nodes;
};

/**
 * Creates graph edges from response relationships
 */
export const createGraphEdges = (
  responses: ResponseNode[],
  colorAssignments: Map<string, ColorAssignment>
): GraphEdge[] => {
  const edges: GraphEdge[] = [];

  responses.forEach(response => {
    if (response.responds_to) {
      const color = colorAssignments.get(response.conversation_id)?.color;
      edges.push({
        source: response.responds_to,
        target: response.id,
        color
      });
    }
  });

  return edges;
};

/**
 * Calculates statistics for the data
 */
export interface DataStatistics {
  conversationCount: number;
  questionCount: number;
  responseCount: number;
  totalDuration: number; // in milliseconds
  participantCount: number;
  edgeCount: number;
}

export const calculateStatistics = (data: AnthologyData): DataStatistics => {
  const participants = new Set<string>();

  // Count unique participants
  data.conversations.forEach(conv => {
    conv.metadata.participants?.forEach(p => participants.add(p));
  });

  // Calculate total duration
  const totalDuration = data.conversations.reduce(
    (sum, conv) => sum + (conv.duration || 0),
    0
  );

  // Count edges (response connections)
  const edgeCount = data.responses.filter(r => r.responds_to).length;

  return {
    conversationCount: data.conversations.length,
    questionCount: data.questions.length,
    responseCount: filterResponseNodes(data.responses).length,
    totalDuration,
    participantCount: participants.size,
    edgeCount
  };
};

/**
 * Finds connected components in the graph
 * Useful for identifying isolated subgraphs
 */
export const findConnectedComponents = (
  nodes: GraphNode[],
  edges: GraphEdge[]
): GraphNode[][] => {
  const adjacencyList = new Map<string, Set<string>>();

  // Build adjacency list
  nodes.forEach(node => {
    adjacencyList.set(node.id, new Set());
  });

  edges.forEach(edge => {
    const sourceId = typeof edge.source === 'string' ? edge.source : edge.source.id;
    const targetId = typeof edge.target === 'string' ? edge.target : edge.target.id;

    adjacencyList.get(sourceId)?.add(targetId);
    adjacencyList.get(targetId)?.add(sourceId); // Undirected graph
  });

  // Find components using DFS
  const visited = new Set<string>();
  const components: GraphNode[][] = [];

  const dfs = (nodeId: string, component: GraphNode[]) => {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);

    const node = nodes.find(n => n.id === nodeId);
    if (node) component.push(node);

    const neighbors = adjacencyList.get(nodeId) || new Set();
    neighbors.forEach(neighborId => dfs(neighborId, component));
  };

  nodes.forEach(node => {
    if (!visited.has(node.id)) {
      const component: GraphNode[] = [];
      dfs(node.id, component);
      if (component.length > 0) {
        components.push(component);
      }
    }
  });

  return components;
};

/**
 * Calculates initial positions for nodes
 * Uses a radial layout for questions with responses around them
 */
export const calculateInitialPositions = (
  questions: QuestionNode[],
  questionResponseMap: Map<string, ResponseNode[]>
): Map<string, { x: number; y: number }> => {
  const positions = new Map<string, { x: number; y: number }>();
  const questionRadius = 300; // Distance between questions
  const responseRadius = 100; // Distance of responses from their question

  questions.forEach((question, qIndex) => {
    // Position questions in a circle
    const angle = (qIndex / questions.length) * 2 * Math.PI;
    const qx = Math.cos(angle) * questionRadius;
    const qy = Math.sin(angle) * questionRadius;

    positions.set(question.id, { x: qx, y: qy });

    // Position responses around their question
    const responses = questionResponseMap.get(question.id) || [];
    responses.forEach((response, rIndex) => {
      const responseAngle = (rIndex / responses.length) * 2 * Math.PI;
      const rx = qx + Math.cos(responseAngle) * responseRadius;
      const ry = qy + Math.sin(responseAngle) * responseRadius;

      positions.set(response.id, { x: rx, y: ry });
    });
  });

  return positions;
};
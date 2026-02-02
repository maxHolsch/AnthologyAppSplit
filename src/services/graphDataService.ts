/**
 * Graph Data Service
 * Main entry point for loading complete graph data for visualization via REST API
 */

import type {
  Conversation,
  QuestionNode,
  NarrativeNode,
  ResponseNode,
} from '@/types/data.types';
import { apiClient } from './apiClient';
import type { ApiGraphData } from '../../shared/types/api.types';

/**
 * Transform API conversation to legacy Conversation type
 */
function toConversation(api: ApiGraphData['conversations'][0]): Conversation {
  return {
    conversation_id: api.legacyId || api.id,
    audio_file: api.audioFile,
    duration: api.duration,
    color: api.color,
    metadata: {
      title: api.metadata.title,
      date: api.metadata.date,
      participants: api.metadata.participants,
      speaker_colors: api.metadata.speakerColors,
      location: api.metadata.location,
      facilitator: api.metadata.facilitator,
      topics: api.metadata.topics,
      source_transcript: api.metadata.sourceTranscript,
    },
    // Store the actual UUID for database queries
    _db_id: api.id,
  } as Conversation & { _db_id: string };
}

/**
 * Transform API question to legacy QuestionNode type
 */
function toQuestion(api: ApiGraphData['questions'][0]): QuestionNode & { _db_id: string } {
  return {
    type: 'question' as const,
    id: api.id, // Already canonical (legacy_id || id)
    _db_id: (api as any)._dbId || api.id,
    question_text: api.questionText,
    related_responses: api.relatedResponses,
    facilitator: api.facilitator,
    notes: api.notes,
    path_to_recording: api.pathToRecording,
  };
}

/**
 * Transform API narrative to legacy NarrativeNode type
 */
function toNarrative(api: ApiGraphData['narratives'][0]): NarrativeNode & { _db_id: string } {
  return {
    type: 'narrative' as const,
    id: api.id, // Already canonical (legacy_id || id)
    _db_id: (api as any)._dbId || api.id,
    narrative_text: api.narrativeText,
    related_responses: api.relatedResponses,
    notes: api.notes,
  };
}

/**
 * Transform API response to legacy ResponseNode type
 */
function toResponse(api: ApiGraphData['responses'][0]): ResponseNode & { _db_id: string } {
  // Determine responds_to: use question ID or response ID (already canonical from API)
  const responds_to = api.respondsToQuestionId || api.respondsToResponseId || '';

  return {
    type: 'response' as const,
    id: api.id, // Already canonical (legacy_id || id)
    _db_id: (api as any)._dbId || api.id,
    responds_to,
    responds_to_narrative_id: api.respondsToNarrativeId || undefined,
    speaker_name: api.speakerName,
    speaker_text: api.speakerText,
    pull_quote: api.pullQuote || undefined,
    audio_start: api.audioStartMs || 0,
    audio_end: api.audioEndMs || 0,
    conversation_id: api.conversationId,
    path_to_recording: api.pathToRecording,
    turn_number: api.turnNumber || undefined,
    chronological_turn_number: api.chronologicalTurnNumber || undefined,
    word_timestamps: api.wordTimestamps,
    embedding: api.embedding,
    medium: api.medium || undefined,
    synchronicity: api.synchronicity || undefined,
  };
}

export const GraphDataService = {
  /**
   * Load complete graph data for visualization
   * This is the main entry point for loading data into AnthologyStore
   */
  async loadAll(opts?: { anthologySlug?: string }) {
    console.log('[GraphDataService] loadAll called with opts:', opts);

    try {
      // Make a single API call to load all data
      const graphData = await apiClient.get<ApiGraphData>('/graph/load', {
        anthologySlug: opts?.anthologySlug,
      });

      // Check for empty dataset
      if (graphData.conversations.length === 0) {
        console.warn('No conversations found in database');
        return { conversations: [], questions: [], narratives: [], responses: [] };
      }

      // Transform API types to legacy types
      const conversations = graphData.conversations.map(toConversation);
      const questions = graphData.questions.map(toQuestion);
      const narratives = graphData.narratives.map(toNarrative);
      const responses = graphData.responses.map(toResponse);

      console.log('[GraphDataService] Loaded:', {
        conversations: conversations.length,
        questions: questions.length,
        narratives: narratives.length,
        responses: responses.length,
      });

      return {
        conversations,
        questions,
        narratives,
        responses,
      };
    } catch (error) {
      console.error('Error loading graph data:', error);
      throw error;
    }
  },

  /**
   * Subscribe to real-time updates
   * Note: Real-time subscriptions still require direct Supabase connection
   * This is intentionally kept for now as it's a separate concern from the data layer
   */
  subscribeToUpdates(callback: () => void) {
    // Real-time updates are not supported through the REST API
    // For now, return a no-op unsubscribe function
    // In the future, this could be implemented with WebSockets or SSE
    console.warn('[GraphDataService] Real-time updates not yet supported via API');
    return () => {
      // No-op cleanup function
    };
  },
};

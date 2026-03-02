/**
 * Response Service
 * Handles response data and word timestamps via REST API
 */

import type { ResponseNode, WordTimestamp } from '@/types/data.types';
import { apiClient } from './apiClient';
import type { ApiResponseNode, ApiWordTimestamp } from '../../shared/types/api.types';

/**
 * Transform API response to legacy ResponseNode type
 */
function toResponse(api: ApiResponseNode): ResponseNode & { _db_id: string } {
  return {
    type: 'response' as const,
    id: api.legacyId || api.id,
    _db_id: api.id,
    responds_to: api.respondsToQuestionId || api.respondsToResponseId || '',
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
    embedding: api.embedding,
    medium: api.medium || undefined,
    synchronicity: api.synchronicity || undefined,
  };
}

/**
 * Transform API word timestamp to legacy WordTimestamp type
 */
function toWordTimestamp(api: ApiWordTimestamp): WordTimestamp {
  return {
    text: api.text,
    start: api.start,
    end: api.end,
    confidence: api.confidence,
    speaker: api.speaker,
  };
}

export const ResponseService = {
  /**
   * Get all responses for a conversation
   */
  async getByConversation(conversationId: string): Promise<ResponseNode[]> {
    try {
      const responses = await apiClient.get<ApiResponseNode[]>(
        `/conversations/${conversationId}/responses`
      );
      return responses.map(toResponse);
    } catch (error) {
      console.error('Error fetching responses:', error);
      return [];
    }
  },

  /**
   * Get word timestamps for a response
   */
  async getWordTimestamps(responseId: string): Promise<WordTimestamp[]> {
    try {
      const timestamps = await apiClient.get<ApiWordTimestamp[]>(
        `/responses/${responseId}/word-timestamps`
      );
      return timestamps.map(toWordTimestamp);
    } catch (error) {
      console.error('Error fetching word timestamps:', error);
      return [];
    }
  },
};

/**
 * Question Service
 * Handles question and question-response operations via REST API
 */

import type { QuestionNode, ResponseNode } from '@/types/data.types';
import { apiClient } from './apiClient';
import type { ApiQuestion, ApiResponse } from '../../shared/types/api.types';

/**
 * Transform API question to legacy QuestionNode type
 */
function toQuestion(api: ApiQuestion): QuestionNode & { _db_id: string } {
  return {
    type: 'question' as const,
    id: api.legacyId || api.id,
    _db_id: api.id,
    question_text: api.questionText,
    related_responses: api.relatedResponses,
    path_to_recording: api.pathToRecording,
    facilitator: api.facilitator,
    notes: api.notes,
  };
}

/**
 * Transform API response to legacy ResponseNode type
 */
function toResponse(api: ApiResponse): ResponseNode {
  return {
    type: 'response' as const,
    id: api.legacyId || api.id,
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

export const QuestionService = {
  /**
   * Get all questions for a conversation
   */
  async getByConversation(conversationId: string): Promise<QuestionNode[]> {
    try {
      const questions = await apiClient.get<ApiQuestion[]>(
        `/conversations/${conversationId}/questions`
      );
      return questions.map(toQuestion);
    } catch (error) {
      console.error('Error fetching questions:', error);
      return [];
    }
  },

  /**
   * Get responses for a question
   */
  async getResponses(questionId: string): Promise<ResponseNode[]> {
    try {
      const responses = await apiClient.get<ApiResponse[]>(
        `/questions/${questionId}/responses`
      );
      return responses.map(toResponse);
    } catch (error) {
      console.error('Error fetching question responses:', error);
      return [];
    }
  },
};

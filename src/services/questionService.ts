/**
 * Question Service
 * Handles question and question-response operations
 */

import type { QuestionNode, ResponseNode } from '@/types/data.types';
import { supabase } from './supabaseClient';

export const QuestionService = {
  /**
   * Get all questions for a conversation
   */
  async getByConversation(conversationId: string): Promise<QuestionNode[]> {
    const { data, error } = await supabase
      .from('anthology_questions')
      .select(`
        *,
        recording:anthology_recordings (*)
      `)
      .eq('conversation_id', conversationId)
      .order('created_at');

    if (error) {
      console.error('Error fetching questions:', error);
      return [];
    }

    return data.map((q: any) => ({
      type: 'question' as const,
      id: q.legacy_id || q.id,
      _db_id: q.id,
      question_text: q.question_text,
      related_responses: [], // Will be populated when loading responses
      path_to_recording: q.recording?.file_path,
      audio_start_ms: q.audio_start_ms,
      audio_end_ms: q.audio_end_ms,
      facilitator: q.facilitator,
      notes: q.notes
    }));
  },

  /**
   * Get responses for a question
   */
  async getResponses(questionId: string): Promise<ResponseNode[]> {
    const { data, error } = await supabase
      .from('anthology_responses')
      .select(`
        *,
        recording:anthology_recordings (*),
        speaker:anthology_speakers (*)
      `)
      .eq('responds_to_question_id', questionId)
      .order('turn_number');

    if (error) {
      console.error('Error fetching question responses:', error);
      return [];
    }

    return data.map((r: any) => ({
      type: 'response' as const,
      id: r.legacy_id || r.id,
      responds_to: questionId,
      speaker_name: r.speaker_name,
      speaker_text: r.speaker_text,
      pull_quote: r.pull_quote,
      audio_start: r.audio_start_ms,
      audio_end: r.audio_end_ms,
      conversation_id: r.conversation_id,
      path_to_recording: r.recording?.file_path,
      turn_number: r.turn_number
    }));
  }
};

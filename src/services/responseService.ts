/**
 * Response Service
 * Handles response data and word timestamps
 */

import type { ResponseNode, WordTimestamp } from '@/types/data.types';
import { supabase, type DbWordTimestamp } from './supabaseClient';
import { parseVectorString } from '@/utils/semanticLayout';

export const ResponseService = {
  /**
   * Get all responses for a conversation
   */
  async getByConversation(conversationId: string): Promise<ResponseNode[]> {
    const { data, error } = await supabase
      .from('anthology_responses')
      .select(`
        id,
        legacy_id,
        conversation_id,
        responds_to_question_id,
        responds_to_response_id,
        responds_to_narrative_id,
        speaker_name,
        speaker_text,
        pull_quote,
        audio_start_ms,
        audio_end_ms,
        turn_number,
        chronological_turn_number,
        embedding,
        medium,
        synchronicity,
        recording:anthology_recordings (*),
        speaker:anthology_speakers (*),
        conversation:anthology_conversations!conversation_id (id, legacy_id)
      `)
      .eq('conversation_id', conversationId)
      .order('turn_number');

    if (error) {
      console.error('Error fetching responses:', error);
      return [];
    }

    console.log('[ResponseService] Sample response from DB:', data[0]);

    return data.map((r: any) => {
      // IMPORTANT:
      // - We intentionally do NOT expand the parent question/response relationship here.
      //   PostgREST relationship names can vary across Supabase projects, and self-joins
      //   often fail with PGRST200 (schema cache mismatch).
      // - Instead, we return the raw FK UUID in `responds_to` and canonicalize it inside
      //   GraphDataService.loadAll() once we have all questions/responses loaded.
      const respondsToFk = (r.responds_to_question_id || r.responds_to_response_id || '') as string;

      // Parse embedding from PostgreSQL vector string to number array
      const embedding = parseVectorString(r.embedding);

      return {
        type: 'response' as const,
        id: r.legacy_id || r.id,
        _db_id: r.id,
        responds_to: respondsToFk,
        speaker_name: r.speaker_name,
        speaker_text: r.speaker_text,
        pull_quote: r.pull_quote,
        audio_start: r.audio_start_ms,
        audio_end: r.audio_end_ms,
        conversation_id: r.conversation?.legacy_id || r.conversation?.id || r.conversation_id,
        path_to_recording: r.recording?.file_path,
        turn_number: r.turn_number,
        chronological_turn_number: r.chronological_turn_number,
        embedding: embedding || undefined, // Include embedding if available
        medium: r.medium,  // 'audio' or 'text'
        synchronicity: r.synchronicity,  // 'sync' or 'asynchronous'
        responds_to_narrative_id: r.responds_to_narrative_id,  // Narrative ID for narrative view
      };
    });
  },

  /**
   * Get word timestamps for a response
   */
  async getWordTimestamps(responseId: string): Promise<WordTimestamp[]> {
    const { data, error } = await supabase
      .from('anthology_word_timestamps')
      .select('*')
      .eq('response_id', responseId)
      .order('word_order');

    if (error) {
      console.error('Error fetching word timestamps:', error);
      return [];
    }

    return data.map((w: DbWordTimestamp) => ({
      text: w.text,
      start: w.start_ms,
      end: w.end_ms,
      confidence: w.confidence || 0,
      speaker: w.speaker || ''
    }));
  }
};

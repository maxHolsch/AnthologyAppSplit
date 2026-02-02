/**
 * API endpoint: GET /api/questions/:id/responses
 * Get all responses that respond to a specific question
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../../_lib/supabase';
import { jsonResponse, handleError, errorResponse } from '../../_lib/response';
import { QuestionResponsesSchema, safeParseQuery } from '../../_lib/validation';
import { ErrorCodes } from '../../_lib/errors';
import type { ApiResponse } from '../../../shared/types/api.types';

/**
 * Parse PostgreSQL vector string to number array
 */
function parseVectorString(embedding: unknown): number[] | undefined {
  if (!embedding) return undefined;

  if (Array.isArray(embedding)) {
    return embedding;
  }

  if (typeof embedding === 'string') {
    if (embedding.startsWith('[') && embedding.endsWith(']')) {
      try {
        return embedding
          .slice(1, -1)
          .split(',')
          .map((s) => parseFloat(s.trim()));
      } catch {
        return undefined;
      }
    }
  }

  return undefined;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return errorResponse(res, ErrorCodes.METHOD_NOT_ALLOWED, 'Method not allowed', {
      allowedMethods: ['GET'],
    });
  }

  try {
    const parsed = safeParseQuery(QuestionResponsesSchema, req.query);

    if (!parsed.success) {
      return errorResponse(res, ErrorCodes.VALIDATION_ERROR, 'Invalid parameters', {
        fieldErrors: parsed.error.flatten().fieldErrors,
      });
    }

    const { id } = parsed.data;

    const { data, error } = await supabase
      .from('anthology_responses')
      .select(
        `
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
        created_at,
        recording:anthology_recordings (file_path)
      `
      )
      .eq('responds_to_question_id', id)
      .order('turn_number', { ascending: true });

    if (error) {
      console.error('[GET /api/questions/:id/responses] Database error:', error);
      return errorResponse(res, ErrorCodes.DATABASE_ERROR, 'Failed to fetch responses');
    }

    const responses: ApiResponse[] = (data || []).map((row: any) => ({
      id: row.id,
      legacyId: row.legacy_id,
      conversationId: row.conversation_id,
      respondsToQuestionId: row.responds_to_question_id,
      respondsToResponseId: row.responds_to_response_id,
      respondsToNarrativeId: row.responds_to_narrative_id,
      speakerName: row.speaker_name,
      speakerText: row.speaker_text,
      pullQuote: row.pull_quote,
      audioStartMs: row.audio_start_ms,
      audioEndMs: row.audio_end_ms,
      turnNumber: row.turn_number,
      chronologicalTurnNumber: row.chronological_turn_number,
      pathToRecording: row.recording?.file_path,
      medium: row.medium,
      synchronicity: row.synchronicity,
      embedding: parseVectorString(row.embedding),
      createdAt: row.created_at,
    }));

    return jsonResponse(res, responses);
  } catch (error) {
    return handleError(res, error);
  }
}

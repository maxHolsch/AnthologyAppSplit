/**
 * API endpoint: GET /api/conversations/:id/questions
 * Get all questions for a conversation
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../../_lib/supabase';
import { jsonResponse, handleError, errorResponse } from '../../_lib/response';
import { ConversationByIdSchema, safeParseQuery } from '../../_lib/validation';
import { ErrorCodes } from '../../_lib/errors';
import type { ApiQuestion } from '../../../shared/types/api.types';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return errorResponse(res, ErrorCodes.METHOD_NOT_ALLOWED, 'Method not allowed', {
      allowedMethods: ['GET'],
    });
  }

  try {
    const parsed = safeParseQuery(ConversationByIdSchema, req.query);

    if (!parsed.success) {
      return errorResponse(res, ErrorCodes.VALIDATION_ERROR, 'Invalid parameters', {
        fieldErrors: parsed.error.flatten().fieldErrors,
      });
    }

    const { id } = parsed.data;

    const { data, error } = await supabase
      .from('anthology_questions')
      .select(
        `
        *,
        recording:anthology_recordings (file_path)
      `
      )
      .eq('conversation_id', id)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[GET /api/conversations/:id/questions] Database error:', error);
      return errorResponse(res, ErrorCodes.DATABASE_ERROR, 'Failed to fetch questions');
    }

    const questions: ApiQuestion[] = (data || []).map((row: any) => ({
      id: row.id,
      legacyId: row.legacy_id,
      conversationId: row.conversation_id,
      questionText: row.question_text,
      relatedResponses: [], // Will be populated by graph/load endpoint
      facilitator: row.facilitator,
      notes: row.notes,
      pathToRecording: row.recording?.file_path,
      audioStartMs: row.audio_start_ms,
      audioEndMs: row.audio_end_ms,
      createdAt: row.created_at,
    }));

    return jsonResponse(res, questions);
  } catch (error) {
    return handleError(res, error);
  }
}

/**
 * API endpoint: GET /api/questions
 * List questions with optional filtering
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../_lib/supabase';
import { paginatedResponse, handleError, errorResponse } from '../_lib/response';
import { QuestionsQuerySchema, safeParseQuery } from '../_lib/validation';
import { ErrorCodes } from '../_lib/errors';
import type { ApiQuestion } from '../../shared/types/api.types';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return errorResponse(res, ErrorCodes.METHOD_NOT_ALLOWED, 'Method not allowed', {
      allowedMethods: ['GET'],
    });
  }

  try {
    const parsed = safeParseQuery(QuestionsQuerySchema, req.query);

    if (!parsed.success) {
      return errorResponse(res, ErrorCodes.VALIDATION_ERROR, 'Invalid parameters', {
        fieldErrors: parsed.error.flatten().fieldErrors,
      });
    }

    const { limit, offset, conversationId, anthologyId } = parsed.data;

    let query = supabase
      .from('anthology_questions')
      .select(
        `
        *,
        recording:anthology_recordings (file_path),
        conversation:anthology_conversations!inner (anthology_id)
      `,
        { count: 'exact' }
      )
      .order('created_at', { ascending: true })
      .range(offset, offset + limit - 1);

    if (conversationId) {
      query = query.eq('conversation_id', conversationId);
    }

    if (anthologyId) {
      query = query.eq('conversation.anthology_id', anthologyId);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('[GET /api/questions] Database error:', error);
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

    return paginatedResponse(res, questions, {
      total: count ?? 0,
      limit,
      offset,
      hasMore: offset + limit < (count ?? 0),
    });
  } catch (error) {
    return handleError(res, error);
  }
}

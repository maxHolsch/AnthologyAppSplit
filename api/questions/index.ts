/**
 * API endpoint: GET, POST /api/questions
 * List questions or create a new question
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../_lib/supabase';
import { paginatedResponse, createdResponse, handleError, errorResponse } from '../_lib/response';
import { QuestionsQuerySchema, CreateQuestionSchema, safeParseQuery } from '../_lib/validation';
import { ErrorCodes, validationError, badRequest } from '../_lib/errors';
import type { ApiQuestion } from '../../shared/types/api.types';

function rowToQuestion(row: any): ApiQuestion {
  return {
    id: row.id,
    legacyId: row.legacy_id,
    conversationId: row.conversation_id,
    questionText: row.question_text,
    relatedResponses: [],
    facilitator: row.facilitator,
    notes: row.notes,
    pathToRecording: row.recording?.file_path,
    audioStartMs: row.audio_start_ms,
    audioEndMs: row.audio_end_ms,
    createdAt: row.created_at,
  };
}

async function handleGet(req: VercelRequest, res: VercelResponse) {
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

  const questions: ApiQuestion[] = (data || []).map(rowToQuestion);

  return paginatedResponse(res, questions, {
    total: count ?? 0,
    limit,
    offset,
    hasMore: offset + limit < (count ?? 0),
  });
}

async function handlePost(req: VercelRequest, res: VercelResponse) {
  const parsed = CreateQuestionSchema.safeParse(req.body);

  if (!parsed.success) {
    throw validationError('Invalid request body', parsed.error.flatten().fieldErrors);
  }

  const { conversationId, questionText, facilitator, notes, audioStartMs, audioEndMs } = parsed.data;

  // Verify conversation exists and get anthology_id
  const { data: conversation, error: convError } = await supabase
    .from('anthology_conversations')
    .select('anthology_id')
    .eq('id', conversationId)
    .maybeSingle();

  if (convError || !conversation) {
    throw badRequest('Conversation not found');
  }

  const { data, error } = await supabase
    .from('anthology_questions')
    .insert({
      anthology_id: conversation.anthology_id,
      conversation_id: conversationId,
      question_text: questionText,
      facilitator: facilitator ?? null,
      notes: notes ?? null,
      audio_start_ms: audioStartMs ?? null,
      audio_end_ms: audioEndMs ?? null,
    })
    .select(`*, recording:anthology_recordings (file_path)`)
    .single();

  if (error) {
    console.error('[POST /api/questions] Database error:', error);
    return errorResponse(res, ErrorCodes.DATABASE_ERROR, 'Failed to create question');
  }

  return createdResponse(res, rowToQuestion(data));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    switch (req.method) {
      case 'GET':
        return handleGet(req, res);
      case 'POST':
        return handlePost(req, res);
      default:
        return errorResponse(res, ErrorCodes.METHOD_NOT_ALLOWED, 'Method not allowed', {
          allowedMethods: ['GET', 'POST'],
        });
    }
  } catch (error) {
    return handleError(res, error);
  }
}

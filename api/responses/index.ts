/**
 * API endpoint: GET, POST /api/responses
 * List responses or create a new response
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../_lib/supabase';
import {
  paginatedResponse,
  createdResponse,
  handleError,
  errorResponse,
} from '../_lib/response';
import {
  ResponsesQuerySchema,
  CreateResponseSchema,
  safeParseQuery,
} from '../_lib/validation';
import { ErrorCodes, validationError } from '../_lib/errors';
import { requireAuth } from '../_lib/auth';
import type { ApiResponse } from '../../shared/types/api.types';

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

async function handleGet(req: VercelRequest, res: VercelResponse) {
  const parsed = safeParseQuery(ResponsesQuerySchema, req.query);

  if (!parsed.success) {
    return errorResponse(res, ErrorCodes.VALIDATION_ERROR, 'Invalid parameters', {
      fieldErrors: parsed.error.flatten().fieldErrors,
    });
  }

  const { limit, offset, conversationId, anthologyId, questionId, narrativeId, speakerId } =
    parsed.data;

  let query = supabase
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
      recording:anthology_recordings (file_path),
      conversation:anthology_conversations!inner (anthology_id)
    `,
      { count: 'exact' }
    )
    .order('turn_number', { ascending: true })
    .range(offset, offset + limit - 1);

  if (conversationId) {
    query = query.eq('conversation_id', conversationId);
  }

  if (anthologyId) {
    query = query.eq('conversation.anthology_id', anthologyId);
  }

  if (questionId) {
    query = query.eq('responds_to_question_id', questionId);
  }

  if (narrativeId) {
    query = query.eq('responds_to_narrative_id', narrativeId);
  }

  if (speakerId) {
    query = query.eq('speaker_id', speakerId);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('[GET /api/responses] Database error:', error);
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

  return paginatedResponse(res, responses, {
    total: count ?? 0,
    limit,
    offset,
    hasMore: offset + limit < (count ?? 0),
  });
}

async function handlePost(req: VercelRequest, res: VercelResponse) {
  // Require authentication for creating responses
  await requireAuth(req);

  const parsed = CreateResponseSchema.safeParse(req.body);

  if (!parsed.success) {
    throw validationError('Invalid request body', parsed.error.flatten().fieldErrors);
  }

  const {
    conversationId,
    respondsToQuestionId,
    respondsToResponseId,
    respondsToNarrativeId,
    speakerName,
    speakerText,
    pullQuote,
    audioStartMs,
    audioEndMs,
    turnNumber,
    medium,
    synchronicity,
  } = parsed.data;

  // Get the next turn number if not provided
  let finalTurnNumber = turnNumber;
  if (finalTurnNumber === undefined) {
    const { data: maxTurn } = await supabase
      .from('anthology_responses')
      .select('turn_number')
      .eq('conversation_id', conversationId)
      .order('turn_number', { ascending: false })
      .limit(1)
      .maybeSingle();

    finalTurnNumber = (maxTurn?.turn_number ?? 0) + 1;
  }

  const { data, error } = await supabase
    .from('anthology_responses')
    .insert({
      conversation_id: conversationId,
      responds_to_question_id: respondsToQuestionId,
      responds_to_response_id: respondsToResponseId,
      responds_to_narrative_id: respondsToNarrativeId,
      speaker_name: speakerName,
      speaker_text: speakerText,
      pull_quote: pullQuote,
      audio_start_ms: audioStartMs,
      audio_end_ms: audioEndMs,
      turn_number: finalTurnNumber,
      medium: medium ?? 'text',
      synchronicity: synchronicity ?? 'asynchronous',
    })
    .select()
    .single();

  if (error) {
    console.error('[POST /api/responses] Database error:', error);
    return errorResponse(res, ErrorCodes.DATABASE_ERROR, 'Failed to create response');
  }

  const response: ApiResponse = {
    id: data.id,
    legacyId: data.legacy_id,
    conversationId: data.conversation_id,
    respondsToQuestionId: data.responds_to_question_id,
    respondsToResponseId: data.responds_to_response_id,
    respondsToNarrativeId: data.responds_to_narrative_id,
    speakerName: data.speaker_name,
    speakerText: data.speaker_text,
    pullQuote: data.pull_quote,
    audioStartMs: data.audio_start_ms,
    audioEndMs: data.audio_end_ms,
    turnNumber: data.turn_number,
    chronologicalTurnNumber: data.chronological_turn_number,
    medium: data.medium,
    synchronicity: data.synchronicity,
    createdAt: data.created_at,
  };

  return createdResponse(res, response);
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

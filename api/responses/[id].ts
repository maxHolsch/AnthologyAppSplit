/**
 * API endpoint: GET, PATCH, DELETE /api/responses/:id
 * Get, update, or delete a single response
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../_lib/supabase';
import {
  jsonResponse,
  noContent,
  handleError,
  errorResponse,
} from '../_lib/response';
import { ResponseByIdSchema, UpdateResponseSchema, safeParseQuery } from '../_lib/validation';
import { ErrorCodes, notFound, validationError } from '../_lib/errors';
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
  const parsed = safeParseQuery(ResponseByIdSchema, req.query);

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
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('[GET /api/responses/:id] Database error:', error);
    return errorResponse(res, ErrorCodes.DATABASE_ERROR, 'Failed to fetch response');
  }

  if (!data) {
    throw notFound('Response', id);
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
    pathToRecording: data.recording?.file_path,
    medium: data.medium,
    synchronicity: data.synchronicity,
    embedding: parseVectorString(data.embedding),
    createdAt: data.created_at,
  };

  return jsonResponse(res, response);
}

async function handlePatch(req: VercelRequest, res: VercelResponse) {
  // Require authentication for updating responses
  await requireAuth(req);

  const idParsed = safeParseQuery(ResponseByIdSchema, req.query);

  if (!idParsed.success) {
    return errorResponse(res, ErrorCodes.VALIDATION_ERROR, 'Invalid parameters', {
      fieldErrors: idParsed.error.flatten().fieldErrors,
    });
  }

  const { id } = idParsed.data;

  const bodyParsed = UpdateResponseSchema.safeParse(req.body);

  if (!bodyParsed.success) {
    throw validationError('Invalid request body', bodyParsed.error.flatten().fieldErrors);
  }

  const { speakerText, pullQuote, respondsToNarrativeId, audioStartMs, audioEndMs } =
    bodyParsed.data;

  // Build update object with only provided fields
  const updates: Record<string, unknown> = {};
  if (speakerText !== undefined) updates.speaker_text = speakerText;
  if (pullQuote !== undefined) updates.pull_quote = pullQuote;
  if (respondsToNarrativeId !== undefined) updates.responds_to_narrative_id = respondsToNarrativeId;
  if (audioStartMs !== undefined) updates.audio_start_ms = audioStartMs;
  if (audioEndMs !== undefined) updates.audio_end_ms = audioEndMs;

  if (Object.keys(updates).length === 0) {
    return errorResponse(res, ErrorCodes.BAD_REQUEST, 'No fields to update');
  }

  const { data, error } = await supabase
    .from('anthology_responses')
    .update(updates)
    .eq('id', id)
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
    .maybeSingle();

  if (error) {
    console.error('[PATCH /api/responses/:id] Database error:', error);
    return errorResponse(res, ErrorCodes.DATABASE_ERROR, 'Failed to update response');
  }

  if (!data) {
    throw notFound('Response', id);
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
    pathToRecording: data.recording?.file_path,
    medium: data.medium,
    synchronicity: data.synchronicity,
    embedding: parseVectorString(data.embedding),
    createdAt: data.created_at,
  };

  return jsonResponse(res, response);
}

async function handleDelete(req: VercelRequest, res: VercelResponse) {
  // Require authentication for deleting responses
  await requireAuth(req);

  const parsed = safeParseQuery(ResponseByIdSchema, req.query);

  if (!parsed.success) {
    return errorResponse(res, ErrorCodes.VALIDATION_ERROR, 'Invalid parameters', {
      fieldErrors: parsed.error.flatten().fieldErrors,
    });
  }

  const { id } = parsed.data;

  // First check if the response exists
  const { data: existing, error: checkError } = await supabase
    .from('anthology_responses')
    .select('id')
    .eq('id', id)
    .maybeSingle();

  if (checkError) {
    console.error('[DELETE /api/responses/:id] Database error:', checkError);
    return errorResponse(res, ErrorCodes.DATABASE_ERROR, 'Failed to check response');
  }

  if (!existing) {
    throw notFound('Response', id);
  }

  const { error } = await supabase.from('anthology_responses').delete().eq('id', id);

  if (error) {
    console.error('[DELETE /api/responses/:id] Database error:', error);
    return errorResponse(res, ErrorCodes.DATABASE_ERROR, 'Failed to delete response');
  }

  return noContent(res);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    switch (req.method) {
      case 'GET':
        return handleGet(req, res);
      case 'PATCH':
        return handlePatch(req, res);
      case 'DELETE':
        return handleDelete(req, res);
      default:
        return errorResponse(res, ErrorCodes.METHOD_NOT_ALLOWED, 'Method not allowed', {
          allowedMethods: ['GET', 'PATCH', 'DELETE'],
        });
    }
  } catch (error) {
    return handleError(res, error);
  }
}

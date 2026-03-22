/**
 * API endpoint: POST /api/sensemaking/create-responses
 *
 * Start an async job to create anthology_responses rows from the filtered turns.
 * Requires that filter-turns has completed.
 *
 * Status is tracked in the conversation's metadata column.
 *
 * Call POST /api/sensemaking/create-responses/tick to advance the job and
 * GET /api/sensemaking/create-responses/status to check progress.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../_lib/supabase';
import { jsonResponse, handleError, errorResponse } from '../_lib/response';
import { ErrorCodes, notFound, badRequest } from '../_lib/errors';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return errorResponse(res, ErrorCodes.METHOD_NOT_ALLOWED, 'Method not allowed', {
      allowedMethods: ['POST'],
    });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const conversationId = body?.conversationId;

    if (!conversationId || typeof conversationId !== 'string') {
      return errorResponse(res, ErrorCodes.VALIDATION_ERROR, 'Invalid parameters', {
        fieldErrors: { conversationId: ['Required field'] },
      });
    }

    const { data: conversation, error: convErr } = await supabase
      .from('anthology_conversations')
      .select('id, metadata')
      .eq('id', conversationId)
      .single();

    if (convErr || !conversation) {
      throw notFound('Conversation', conversationId);
    }

    const convMeta = (conversation.metadata || {}) as Record<string, unknown>;

    // Guard: filter-turns must be completed
    if (convMeta.filter_turns_status !== 'completed') {
      throw badRequest(
        `filter-turns must be completed first. Current status: ${convMeta.filter_turns_status || 'none'}`
      );
    }

    const filteredTurnsPath = convMeta.filtered_turns_path as string | undefined;
    if (!filteredTurnsPath) {
      throw badRequest('Conversation metadata is missing filtered_turns_path');
    }

    // Idempotent
    const existingStatus = convMeta.create_responses_status as string | undefined;
    if (existingStatus && ['processing', 'completed'].includes(existingStatus)) {
      return jsonResponse(res, {
        conversationId,
        status: existingStatus,
        responseCount: convMeta.response_count || null,
      });
    }

    const now = new Date().toISOString();

    const { error: updateErr } = await supabase
      .from('anthology_conversations')
      .update({
        metadata: {
          ...convMeta,
          create_responses_status: 'processing',
          create_responses_started_at: now,
          create_responses_error: null,
          create_responses_completed_at: null,
          response_count: null,
        },
      })
      .eq('id', conversationId);

    if (updateErr) {
      console.error('[POST /api/sensemaking/create-responses] Failed to update conversation metadata:', updateErr);
    }

    return jsonResponse(
      res,
      {
        conversationId,
        status: 'processing',
        filteredTurnsPath,
      },
      202
    );
  } catch (error) {
    return handleError(res, error);
  }
}

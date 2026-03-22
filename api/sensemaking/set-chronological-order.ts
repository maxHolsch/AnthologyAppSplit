/**
 * API endpoint: POST /api/sensemaking/set-chronological-order
 *
 * Start an async job to set chronological_turn_number on all sensemaking
 * responses in the conversation based on audio_start_ms temporal order.
 * Requires that create-responses has completed.
 *
 * Status is tracked in the conversation's metadata column.
 *
 * Call POST /api/sensemaking/set-chronological-order/tick to advance the job
 * and GET /api/sensemaking/set-chronological-order/status to check progress.
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

    // Guard: create-responses must be completed
    if (convMeta.create_responses_status !== 'completed') {
      throw badRequest(
        `create-responses must be completed first. Current status: ${convMeta.create_responses_status || 'none'}`
      );
    }

    // Idempotent
    const existingStatus = convMeta.set_chronological_order_status as string | undefined;
    if (existingStatus && ['processing', 'completed'].includes(existingStatus)) {
      return jsonResponse(res, {
        conversationId,
        status: existingStatus,
        chronologicalResponseCount: convMeta.chronological_response_count || null,
      });
    }

    const now = new Date().toISOString();

    const { error: updateErr } = await supabase
      .from('anthology_conversations')
      .update({
        metadata: {
          ...convMeta,
          set_chronological_order_status: 'processing',
          set_chronological_order_started_at: now,
          set_chronological_order_error: null,
          set_chronological_order_completed_at: null,
          chronological_response_count: null,
        },
      })
      .eq('id', conversationId);

    if (updateErr) {
      console.error('[POST /api/sensemaking/set-chronological-order] Failed to update conversation metadata:', updateErr);
    }

    return jsonResponse(
      res,
      {
        conversationId,
        status: 'processing',
      },
      202
    );
  } catch (error) {
    return handleError(res, error);
  }
}

/**
 * API endpoint: GET /api/sensemaking/set-chronological-order/status
 *
 * Read-only status check for a set-chronological-order job.
 * Query: ?conversationId=<uuid>
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../../_lib/supabase';
import { jsonResponse, handleError, errorResponse } from '../../_lib/response';
import { ErrorCodes, notFound } from '../../_lib/errors';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return errorResponse(res, ErrorCodes.METHOD_NOT_ALLOWED, 'Method not allowed', {
      allowedMethods: ['GET'],
    });
  }

  try {
    const conversationId = req.query.conversationId as string | undefined;

    if (!conversationId) {
      return errorResponse(res, ErrorCodes.VALIDATION_ERROR, 'Invalid parameters', {
        fieldErrors: { conversationId: ['Required parameter'] },
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

    return jsonResponse(res, {
      conversationId: conversation.id,
      status: convMeta.set_chronological_order_status || null,
      chronologicalResponseCount: convMeta.chronological_response_count || null,
      error: convMeta.set_chronological_order_error || null,
      startedAt: convMeta.set_chronological_order_started_at || null,
      completedAt: convMeta.set_chronological_order_completed_at || null,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

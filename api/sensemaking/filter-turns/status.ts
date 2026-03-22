/**
 * API endpoint: GET /api/sensemaking/filter-turns/status
 *
 * Read-only status check for a filter-turns job.
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
      status: convMeta.filter_turns_status || null,
      filteredTurnsPath: convMeta.filtered_turns_path || null,
      filteredTurnsCount: convMeta.filtered_turns_count || null,
      error: convMeta.filter_turns_error || null,
      startedAt: convMeta.filter_turns_started_at || null,
      completedAt: convMeta.filter_turns_completed_at || null,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

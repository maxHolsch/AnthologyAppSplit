/**
 * API endpoint: GET /api/sensemaking/assign-narratives/status
 *
 * Read-only status check for an assign-narratives job.
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
      status: convMeta.assign_narratives_status || null,
      assignedNarrativesPath: convMeta.assigned_narratives_path || null,
      turnCount: convMeta.assign_narratives_turn_count || null,
      error: convMeta.assign_narratives_error || null,
      startedAt: convMeta.assign_narratives_started_at || null,
      completedAt: convMeta.assign_narratives_completed_at || null,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

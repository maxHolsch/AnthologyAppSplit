/**
 * API endpoint: POST /api/sensemaking/filter-turns
 *
 * Start an async job to filter turns using Claude quality scoring. Requires
 * that assign-narratives has completed.
 *
 * Status is tracked in the conversation's metadata column.
 *
 * Call POST /api/sensemaking/filter-turns/tick to advance the job and
 * GET /api/sensemaking/filter-turns/status to check progress.
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

    // Guard: assign-narratives must be completed
    if (convMeta.assign_narratives_status !== 'completed') {
      throw badRequest(
        `assign-narratives must be completed first. Current status: ${convMeta.assign_narratives_status || 'none'}`
      );
    }

    const assignedNarrativesPath = convMeta.assigned_narratives_path as string | undefined;
    if (!assignedNarrativesPath) {
      throw badRequest('Conversation metadata is missing assigned_narratives_path');
    }

    // Idempotent
    const existingStatus = convMeta.filter_turns_status as string | undefined;
    if (existingStatus && ['processing', 'completed'].includes(existingStatus)) {
      return jsonResponse(res, {
        conversationId,
        status: existingStatus,
        filteredTurnsPath: convMeta.filtered_turns_path || null,
        filteredTurnsCount: convMeta.filtered_turns_count || null,
      });
    }

    const base = assignedNarrativesPath.replace(/\.assigned-narratives\.json$/, '');
    const filteredTurnsPath = `${base}.filtered-turns.json`;
    const now = new Date().toISOString();

    const { error: updateErr } = await supabase
      .from('anthology_conversations')
      .update({
        metadata: {
          ...convMeta,
          filter_turns_status: 'processing',
          filtered_turns_path: filteredTurnsPath,
          filter_turns_started_at: now,
          filter_turns_error: null,
          filter_turns_completed_at: null,
          filtered_turns_count: null,
        },
      })
      .eq('id', conversationId);

    if (updateErr) {
      console.error('[POST /api/sensemaking/filter-turns] Failed to update conversation metadata:', updateErr);
    }

    return jsonResponse(
      res,
      {
        conversationId,
        status: 'processing',
        filteredTurnsPath,
        assignedNarrativesPath,
      },
      202
    );
  } catch (error) {
    return handleError(res, error);
  }
}

/**
 * API endpoint: POST /api/sensemaking/assign-narratives
 *
 * Start an async job to assign each turn to its best-matching narrative using
 * embedding cosine similarity. Requires that assign-questions has completed.
 *
 * Status is tracked in the conversation's metadata column.
 *
 * Call POST /api/sensemaking/assign-narratives/tick to advance the job and
 * GET /api/sensemaking/assign-narratives/status to check progress.
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

    // Guard: assign-questions must be completed
    if (convMeta.assign_questions_status !== 'completed') {
      throw badRequest(
        `assign-questions must be completed first. Current status: ${convMeta.assign_questions_status || 'none'}`
      );
    }

    const assignedQuestionsPath = convMeta.assigned_questions_path as string | undefined;
    if (!assignedQuestionsPath) {
      throw badRequest('Conversation metadata is missing assigned_questions_path');
    }

    // Idempotent
    const existingStatus = convMeta.assign_narratives_status as string | undefined;
    if (existingStatus && ['processing', 'completed'].includes(existingStatus)) {
      return jsonResponse(res, {
        conversationId,
        status: existingStatus,
        assignedNarrativesPath: convMeta.assigned_narratives_path || null,
        turnCount: convMeta.assign_narratives_turn_count || null,
      });
    }

    // Derive path from the base (strip .assigned-questions.json suffix)
    const base = assignedQuestionsPath.replace(/\.assigned-questions\.json$/, '');
    const assignedNarrativesPath = `${base}.assigned-narratives.json`;
    const now = new Date().toISOString();

    const { error: updateErr } = await supabase
      .from('anthology_conversations')
      .update({
        metadata: {
          ...convMeta,
          assign_narratives_status: 'processing',
          assigned_narratives_path: assignedNarrativesPath,
          assign_narratives_started_at: now,
          assign_narratives_error: null,
          assign_narratives_completed_at: null,
          assign_narratives_turn_count: null,
        },
      })
      .eq('id', conversationId);

    if (updateErr) {
      console.error('[POST /api/sensemaking/assign-narratives] Failed to update conversation metadata:', updateErr);
    }

    return jsonResponse(
      res,
      {
        conversationId,
        status: 'processing',
        assignedNarrativesPath,
        assignedQuestionsPath,
      },
      202
    );
  } catch (error) {
    return handleError(res, error);
  }
}

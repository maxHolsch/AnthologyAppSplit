/**
 * API endpoint: POST /api/sensemaking/set-chronological-order/tick
 *
 * Advance a set-chronological-order job by fetching all sensemaking responses
 * for the conversation, sorting by audio_start_ms, and setting
 * chronological_turn_number on each. This is a pure DB operation with no
 * external API calls.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../../_lib/supabase';
import { jsonResponse, handleError, errorResponse } from '../../_lib/response';
import { ErrorCodes, notFound, badRequest } from '../../_lib/errors';

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
    const status = convMeta.set_chronological_order_status as string | undefined;

    // Short-circuit if already terminal
    if (status === 'completed' || status === 'error') {
      return jsonResponse(res, {
        conversationId: conversation.id,
        status,
        didWork: false,
        chronologicalResponseCount: convMeta.chronological_response_count || null,
        error: convMeta.set_chronological_order_error || null,
      });
    }

    if (status !== 'processing') {
      throw badRequest(
        'Conversation set-chronological-order job is not in processing state. Call POST /api/sensemaking/set-chronological-order first.'
      );
    }

    // Load all sensemaking responses for this conversation, ordered by audio_start_ms
    const { data: responses, error: fetchErr } = await supabase
      .from('anthology_responses')
      .select('id, audio_start_ms, metadata')
      .eq('conversation_id', conversationId)
      .order('audio_start_ms', { ascending: true });

    if (fetchErr) {
      throw badRequest(`Failed to fetch responses: ${fetchErr.message}`);
    }

    if (!responses || responses.length === 0) {
      const now = new Date().toISOString();
      await supabase
        .from('anthology_conversations')
        .update({
          metadata: {
            ...convMeta,
            set_chronological_order_status: 'completed',
            chronological_response_count: 0,
            set_chronological_order_error: null,
            set_chronological_order_completed_at: now,
          },
        })
        .eq('id', conversationId);

      return jsonResponse(res, {
        conversationId: conversation.id,
        status: 'completed',
        didWork: true,
        chronologicalResponseCount: 0,
      });
    }

    // Filter to only sensemaking responses
    type Response = { id: string; audio_start_ms: number | null; metadata: Record<string, unknown> | null };
    const sensemakingResponses = (responses as Response[]).filter((r) => {
      const rMeta = (r.metadata || {}) as Record<string, unknown>;
      return rMeta.source === 'sensemaking';
    });

    console.log('[POST /api/sensemaking/set-chronological-order/tick] Setting chronological order', {
      conversationId,
      totalResponses: responses.length,
      sensemakingResponses: sensemakingResponses.length,
    });

    // Update each sensemaking response with its chronological position
    let updateCount = 0;
    for (let index = 0; index < sensemakingResponses.length; index++) {
      const r = sensemakingResponses[index];
      const { error: updateErr } = await supabase
        .from('anthology_responses')
        .update({ chronological_turn_number: index + 1 })
        .eq('id', r.id);

      if (updateErr) {
        console.warn('[POST /api/sensemaking/set-chronological-order/tick] Failed to update response:', r.id, updateErr);
      } else {
        updateCount++;
      }
    }

    console.log('[POST /api/sensemaking/set-chronological-order/tick] Set chronological order for', updateCount, 'responses');

    // Update conversation metadata
    const now = new Date().toISOString();
    const { error: metaErr } = await supabase
      .from('anthology_conversations')
      .update({
        metadata: {
          ...convMeta,
          set_chronological_order_status: 'completed',
          chronological_response_count: updateCount,
          set_chronological_order_error: null,
          set_chronological_order_completed_at: now,
        },
      })
      .eq('id', conversationId);

    if (metaErr) {
      console.error('[POST /api/sensemaking/set-chronological-order/tick] DB update error:', metaErr);
    }

    return jsonResponse(res, {
      conversationId: conversation.id,
      status: 'completed',
      didWork: true,
      chronologicalResponseCount: updateCount,
    });
  } catch (error) {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const conversationId = body?.conversationId;
    if (conversationId && typeof conversationId === 'string') {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      try {
        const { data: conv } = await supabase
          .from('anthology_conversations')
          .select('metadata')
          .eq('id', conversationId)
          .single();

        if (conv) {
          const md = (conv.metadata || {}) as Record<string, unknown>;
          await supabase
            .from('anthology_conversations')
            .update({
              metadata: {
                ...md,
                set_chronological_order_status: 'error',
                set_chronological_order_error: errorMessage,
                set_chronological_order_completed_at: new Date().toISOString(),
              },
            })
            .eq('id', conversationId);
        }
      } catch (updateErr) {
        console.error('[POST /api/sensemaking/set-chronological-order/tick] Failed to update error state:', updateErr);
      }
    }

    return handleError(res, error);
  }
}

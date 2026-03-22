/**
 * API endpoint: POST /api/sensemaking/assign-questions
 *
 * Start an async job to assign each merged turn to its best-matching question
 * using Claude. Requires that create-conversation has completed so that questions
 * exist in the database.
 *
 * This is the first step that accepts conversationId rather than recordingId.
 * On start, the merged_turns_path, speaker_map_path, and bucket are copied from
 * the primary recording's metadata into the conversation's metadata so that all
 * downstream steps (assign-narratives, filter-turns, etc.) only need conversationId.
 *
 * Call POST /api/sensemaking/assign-questions/tick to advance the job and
 * GET /api/sensemaking/assign-questions/status to check progress.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase, getConversationsBucket } from '../_lib/supabase';
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

    // Load conversation
    const { data: conversation, error: convErr } = await supabase
      .from('anthology_conversations')
      .select('id, anthology_id, metadata')
      .eq('id', conversationId)
      .single();

    if (convErr || !conversation) {
      throw notFound('Conversation', conversationId);
    }

    const convMeta = (conversation.metadata || {}) as Record<string, unknown>;

    // Idempotent: return early if already started or completed
    const existingStatus = convMeta.assign_questions_status as string | undefined;
    if (existingStatus && ['processing', 'completed'].includes(existingStatus)) {
      return jsonResponse(res, {
        conversationId,
        status: existingStatus,
        assignedQuestionsPath: convMeta.assigned_questions_path || null,
        turnCount: convMeta.assign_questions_turn_count || null,
      });
    }

    // Look up primary recording to get storage paths (only needed at job start)
    const { data: link, error: linkErr } = await supabase
      .from('anthology_conversation_recordings')
      .select('recording_id')
      .eq('conversation_id', conversationId)
      .eq('is_primary', true)
      .single();

    if (linkErr || !link) {
      throw badRequest('No primary recording linked to this conversation');
    }

    const { data: recording, error: recErr } = await supabase
      .from('anthology_recordings')
      .select('id, metadata')
      .eq('id', link.recording_id)
      .single();

    if (recErr || !recording) {
      throw badRequest('Primary recording not found');
    }

    const recMeta = (recording.metadata || {}) as Record<string, unknown>;

    const mergedTurnsPath = recMeta.merged_turns_path as string | undefined;
    if (!mergedTurnsPath) {
      throw badRequest('Primary recording is missing merged_turns_path — run prepare-turns first');
    }

    const speakerMapPath = recMeta.speaker_map_path as string | undefined;
    if (!speakerMapPath) {
      throw badRequest('Primary recording is missing speaker_map_path — run identify-speakers first');
    }

    const bucket = (recMeta.bucket as string) || getConversationsBucket();
    const assignedQuestionsPath = `${mergedTurnsPath}.assigned-questions.json`;
    const now = new Date().toISOString();

    // Write status + all paths into conversation metadata so downstream steps
    // only need conversationId and never have to touch the recording.
    const { error: updateErr } = await supabase
      .from('anthology_conversations')
      .update({
        metadata: {
          ...convMeta,
          recording_id: recording.id,
          merged_turns_path: mergedTurnsPath,
          speaker_map_path: speakerMapPath,
          bucket,
          assign_questions_status: 'processing',
          assigned_questions_path: assignedQuestionsPath,
          assign_questions_started_at: now,
          assign_questions_error: null,
          assign_questions_completed_at: null,
          assign_questions_turn_count: null,
        },
      })
      .eq('id', conversationId);

    if (updateErr) {
      console.error('[POST /api/sensemaking/assign-questions] Failed to update conversation metadata:', updateErr);
    }

    return jsonResponse(
      res,
      {
        conversationId,
        status: 'processing',
        assignedQuestionsPath,
        mergedTurnsPath,
        speakerMapPath,
      },
      202
    );
  } catch (error) {
    return handleError(res, error);
  }
}

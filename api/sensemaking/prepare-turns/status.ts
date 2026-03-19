/**
 * API endpoint: GET /api/sensemaking/prepare-turns/status
 *
 * Read-only status check for a prepare-turns job.
 * Query: ?recordingId=<uuid>
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
    const recordingId = req.query.recordingId as string | undefined;

    if (!recordingId) {
      return errorResponse(res, ErrorCodes.VALIDATION_ERROR, 'Invalid parameters', {
        fieldErrors: { recordingId: ['Required parameter'] },
      });
    }

    const { data: recording, error: recErr } = await supabase
      .from('anthology_recordings')
      .select('id, metadata')
      .eq('id', recordingId)
      .single();

    if (recErr || !recording) {
      throw notFound('Recording', recordingId);
    }

    const metadata = (recording.metadata || {}) as Record<string, unknown>;

    return jsonResponse(res, {
      recordingId: recording.id,
      status: metadata.prepare_turns_status || null,
      mergedTurnsPath: metadata.merged_turns_path || null,
      turnCount: metadata.merged_turns_count || null,
      error: metadata.prepare_turns_error || null,
      startedAt: metadata.prepare_turns_started_at || null,
      completedAt: metadata.prepare_turns_completed_at || null,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

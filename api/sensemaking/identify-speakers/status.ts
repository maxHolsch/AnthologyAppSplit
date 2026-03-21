/**
 * API endpoint: GET /api/sensemaking/identify-speakers/status
 *
 * Read-only status check for an identify-speakers job.
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
      status: metadata.identify_speakers_status || null,
      speakerMapPath: metadata.speaker_map_path || null,
      speakerCount: metadata.speaker_count || null,
      error: metadata.identify_speakers_error || null,
      startedAt: metadata.identify_speakers_started_at || null,
      completedAt: metadata.identify_speakers_completed_at || null,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

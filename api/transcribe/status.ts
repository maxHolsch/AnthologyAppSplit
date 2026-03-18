/**
 * API endpoint: GET /api/transcribe/status
 *
 * Read-only status check for a transcription job.
 * Query: ?recordingId=<uuid>
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../_lib/supabase';
import { jsonResponse, handleError, errorResponse } from '../_lib/response';
import { ErrorCodes, notFound } from '../_lib/errors';
import { TranscribeStatusQuerySchema, safeParseQuery } from '../_lib/validation';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return errorResponse(res, ErrorCodes.METHOD_NOT_ALLOWED, 'Method not allowed', {
      allowedMethods: ['GET'],
    });
  }

  try {
    const parsed = safeParseQuery(TranscribeStatusQuerySchema, req.query);
    if (!parsed.success) {
      return errorResponse(res, ErrorCodes.VALIDATION_ERROR, 'Invalid parameters', {
        fieldErrors: parsed.error.flatten().fieldErrors,
      });
    }
    const { recordingId } = parsed.data;

    const { data: recording, error: recErr } = await supabase
      .from('anthology_recordings')
      .select('id, metadata, duration_ms')
      .eq('id', recordingId)
      .single();

    if (recErr || !recording) {
      throw notFound('Recording', recordingId);
    }

    const metadata = (recording.metadata || {}) as Record<string, unknown>;

    return jsonResponse(res, {
      recordingId: recording.id,
      status: metadata.transcription_status || null,
      assemblyId: metadata.assembly_id || null,
      transcriptPath: metadata.transcript_path || null,
      audioDurationMs: metadata.audio_duration_ms || null,
      error: metadata.transcription_error || null,
      startedAt: metadata.transcription_started_at || null,
      completedAt: metadata.transcription_completed_at || null,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

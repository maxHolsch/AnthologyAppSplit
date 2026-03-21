/**
 * API endpoint: GET /api/sensemaking/identify-speakers/speakers
 *
 * Proxy the speaker map JSON from storage for a given recording.
 * Returns the raw speaker map JSON (no { data } wrapper) so callers
 * can fetch it directly and it renders cleanly as "Open Raw JSON".
 *
 * Query: ?recordingId=<uuid>
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase, getConversationsBucket } from '../../_lib/supabase';
import { handleError, errorResponse } from '../../_lib/response';
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
    const speakerMapPath = metadata.speaker_map_path as string | undefined;

    if (!speakerMapPath) {
      return errorResponse(res, ErrorCodes.NOT_FOUND, 'Speaker map not found for this recording');
    }

    const bucket = (metadata.bucket as string) || getConversationsBucket();

    const { data: fileData, error: downloadErr } = await supabase.storage
      .from(bucket)
      .download(speakerMapPath);

    if (downloadErr || !fileData) {
      return errorResponse(res, ErrorCodes.NOT_FOUND, `Speaker map file not found: ${downloadErr?.message ?? 'unknown'}`);
    }

    const text = await fileData.text();
    const json = JSON.parse(text);

    // Return raw JSON — no { data } wrapper — so "Open Raw JSON" renders cleanly
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json(json);
  } catch (error) {
    return handleError(res, error);
  }
}

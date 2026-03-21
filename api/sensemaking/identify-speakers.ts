/**
 * API endpoint: POST /api/sensemaking/identify-speakers
 *
 * Start an async job to infer speaker names from merged turns. Reads the
 * merged turns from storage, validates they are present, and initiates the
 * identify-speakers processing job.
 *
 * The caller should poll POST /api/sensemaking/identify-speakers/tick to
 * advance the job and GET /api/sensemaking/identify-speakers/status to
 * check progress.
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
    // 1. Validate body
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const recordingId = body?.recordingId;

    if (!recordingId || typeof recordingId !== 'string') {
      return errorResponse(res, ErrorCodes.VALIDATION_ERROR, 'Invalid parameters', {
        fieldErrors: { recordingId: ['Required field'] },
      });
    }

    // 2. Look up recording
    const { data: recording, error: recErr } = await supabase
      .from('anthology_recordings')
      .select('id, metadata')
      .eq('id', recordingId)
      .single();

    if (recErr || !recording) {
      throw notFound('Recording', recordingId);
    }

    const metadata = (recording.metadata || {}) as Record<string, unknown>;

    // 3. Guard: must have completed prepare-turns
    const prepareTurnsStatus = metadata.prepare_turns_status as string | undefined;
    if (prepareTurnsStatus !== 'completed') {
      throw badRequest(
        `Recording prepare-turns must be completed first. Current status: ${prepareTurnsStatus || 'none'}`
      );
    }

    const mergedTurnsPath = metadata.merged_turns_path as string | undefined;
    if (!mergedTurnsPath) {
      throw badRequest('Recording metadata is missing merged_turns_path');
    }

    // 4. Guard against re-submission — idempotent if already started
    const existingStatus = metadata.identify_speakers_status as string | undefined;
    if (existingStatus && ['processing', 'completed'].includes(existingStatus)) {
      return jsonResponse(res, {
        recordingId: recording.id,
        status: existingStatus,
        speakerMapPath: metadata.speaker_map_path || null,
        speakerCount: metadata.speaker_count || null,
      });
    }

    // 5. Compute speaker map path (chained from merged turns path)
    const speakerMapPath = `${mergedTurnsPath}.speakers.json`;

    // 6. Update recording metadata to mark job as processing
    const now = new Date().toISOString();
    const updatedMetadata = {
      ...metadata,
      identify_speakers_status: 'processing',
      speaker_map_path: speakerMapPath,
      identify_speakers_started_at: now,
      identify_speakers_error: null,
      identify_speakers_completed_at: null,
      speaker_count: null,
    };

    const { error: updateErr } = await supabase
      .from('anthology_recordings')
      .update({ metadata: updatedMetadata })
      .eq('id', recordingId);

    if (updateErr) {
      console.error('[POST /api/sensemaking/identify-speakers] Failed to update recording metadata:', updateErr);
    }

    // 7. Return immediately
    return jsonResponse(
      res,
      {
        recordingId: recording.id,
        status: 'processing',
        speakerMapPath,
        mergedTurnsPath,
      },
      202
    );
  } catch (error) {
    return handleError(res, error);
  }
}

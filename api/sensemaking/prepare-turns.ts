/**
 * API endpoint: POST /api/sensemaking/prepare-turns
 *
 * Start an async job to clean and merge transcript turns. Reads the transcript
 * from storage, validates utterances are present, and initiates the prepare-turns
 * processing job.
 *
 * The caller should poll POST /api/sensemaking/prepare-turns/tick to advance
 * the job and GET /api/sensemaking/prepare-turns/status to check progress.
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

    // 3. Guard: must have completed transcription
    const transcriptionStatus = metadata.transcription_status as string | undefined;
    if (transcriptionStatus !== 'completed') {
      throw badRequest(
        `Recording transcription must be completed first. Current status: ${transcriptionStatus || 'none'}`
      );
    }

    const transcriptPath = metadata.transcript_path as string | undefined;
    if (!transcriptPath) {
      throw badRequest('Recording metadata is missing transcript_path');
    }

    // 4. Guard against re-submission — idempotent if already started
    const existingStatus = metadata.prepare_turns_status as string | undefined;
    if (existingStatus && ['processing', 'completed'].includes(existingStatus)) {
      return jsonResponse(res, {
        recordingId: recording.id,
        status: existingStatus,
        mergedTurnsPath: metadata.merged_turns_path || null,
        turnCount: metadata.merged_turns_count || null,
      });
    }

    // 5. Verify transcript file exists and has utterances
    const bucket = (metadata.bucket as string) || getConversationsBucket();
    const { data: transcriptData, error: downloadErr } = await supabase.storage
      .from(bucket)
      .download(transcriptPath);

    if (downloadErr || !transcriptData) {
      throw badRequest(
        `Failed to download transcript from storage: ${downloadErr?.message || 'unknown'}`
      );
    }

    const transcriptText = await transcriptData.text();
    const transcript = JSON.parse(transcriptText);

    if (!Array.isArray(transcript.utterances) || transcript.utterances.length === 0) {
      throw badRequest('Transcript has no utterances to process');
    }

    // 6. Compute merged turns path (same directory as transcript)
    const mergedTurnsPath = `${transcriptPath}.merged.json`;

    // 7. Update recording metadata to mark job as processing
    const now = new Date().toISOString();
    const updatedMetadata = {
      ...metadata,
      prepare_turns_status: 'processing',
      merged_turns_path: mergedTurnsPath,
      prepare_turns_started_at: now,
      prepare_turns_error: null,
      prepare_turns_completed_at: null,
      merged_turns_count: null,
    };

    const { error: updateErr } = await supabase
      .from('anthology_recordings')
      .update({ metadata: updatedMetadata })
      .eq('id', recordingId);

    if (updateErr) {
      console.error('[POST /api/sensemaking/prepare-turns] Failed to update recording metadata:', updateErr);
    }

    // 8. Return immediately
    return jsonResponse(
      res,
      {
        recordingId: recording.id,
        status: 'processing',
        mergedTurnsPath,
        utteranceCount: transcript.utterances.length,
      },
      202
    );
  } catch (error) {
    return handleError(res, error);
  }
}

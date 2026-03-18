/**
 * API endpoint: POST /api/transcribe
 *
 * Start an async transcription job for a recording. Looks up the recording
 * by ID, generates a signed URL for the audio file, and submits it to
 * AssemblyAI. Returns immediately with the job status.
 *
 * The caller should poll POST /api/transcribe/tick to advance the job
 * and GET /api/transcribe/status to check progress.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase, getConversationsBucket } from './_lib/supabase';
import { jsonResponse, handleError, errorResponse } from './_lib/response';
import { ErrorCodes, notFound, badRequest } from './_lib/errors';
import { TranscribeStartSchema, safeParseQuery } from './_lib/validation';
import { assemblyStartTranscription, assemblyUploadAudio } from './_lib/assemblyai';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return errorResponse(res, ErrorCodes.METHOD_NOT_ALLOWED, 'Method not allowed', {
      allowedMethods: ['POST'],
    });
  }

  try {
    // 1. Validate body
    const parsed = safeParseQuery(TranscribeStartSchema, req.body);
    if (!parsed.success) {
      return errorResponse(res, ErrorCodes.VALIDATION_ERROR, 'Invalid parameters', {
        fieldErrors: parsed.error.flatten().fieldErrors,
      });
    }
    const { recordingId } = parsed.data;

    // 2. Look up recording
    const { data: recording, error: recErr } = await supabase
      .from('anthology_recordings')
      .select('id, metadata, mime_type')
      .eq('id', recordingId)
      .single();

    if (recErr || !recording) {
      throw notFound('Recording', recordingId);
    }

    const metadata = (recording.metadata || {}) as Record<string, unknown>;

    // 3. Guard against re-submission — idempotent if already started
    const existingStatus = metadata.transcription_status as string | undefined;
    if (existingStatus && ['processing', 'completed'].includes(existingStatus)) {
      return jsonResponse(res, {
        recordingId: recording.id,
        status: existingStatus,
        assemblyId: metadata.assembly_id || null,
        transcriptPath: metadata.transcript_path || null,
      });
    }

    // 4. Get object_path and bucket from metadata
    const objectPath = metadata.object_path as string;
    const bucket = (metadata.bucket as string) || getConversationsBucket();

    if (!objectPath) {
      throw badRequest('Recording metadata is missing object_path');
    }

    // 5. Download the recording from storage and upload the bytes to AssemblyAI.
    // This avoids signed-URL issues where AssemblyAI receives an HTML error page
    // instead of the media object.
    const { data: fileData, error: downloadErr } = await supabase.storage
      .from(bucket)
      .download(objectPath);

    if (downloadErr || !fileData) {
      throw badRequest(`Failed to download recording from storage: ${downloadErr?.message || 'unknown'}`);
    }

    // 6. Ensure AssemblyAI API key
    const apiKey = process.env.ASSEMBLYAI_API_KEY || process.env.ASSEMBLY_API_KEY;
    if (!apiKey) {
      return errorResponse(res, ErrorCodes.INTERNAL_ERROR, 'Missing ASSEMBLYAI_API_KEY');
    }

    const audioBuffer = await fileData.arrayBuffer();
    const { uploadUrl } = await assemblyUploadAudio({
      apiKey,
      audioData: audioBuffer,
      contentType: recording.mime_type || 'application/octet-stream',
    });

    // 7. Start AssemblyAI transcription (non-blocking — just creates the job)
    const { id: assemblyId } = await assemblyStartTranscription({
      apiKey,
      audioUrl: uploadUrl,
    });

    // 8. Compute transcript_path (same directory as the recording file)
    const transcriptPath = `${objectPath}.transcript.json`;

    // 9. Update recording metadata with transcription state
    const now = new Date().toISOString();
    const updatedMetadata = {
      ...metadata,
      transcription_status: 'processing',
      assembly_id: assemblyId,
      transcript_path: transcriptPath,
      transcription_started_at: now,
      transcription_error: null,
      transcription_completed_at: null,
      audio_duration_ms: null,
    };

    const { error: updateErr } = await supabase
      .from('anthology_recordings')
      .update({ metadata: updatedMetadata })
      .eq('id', recordingId);

    if (updateErr) {
      console.error('[POST /api/transcribe] Failed to update recording metadata:', updateErr);
    }

    // 10. Return immediately
    return jsonResponse(res, {
      recordingId: recording.id,
      status: 'processing',
      assemblyId,
      transcriptPath,
    }, 202);
  } catch (error) {
    return handleError(res, error);
  }
}

/**
 * API endpoint: POST /api/transcribe/tick
 *
 * Advance a transcription job by polling AssemblyAI. When the transcript
 * is ready, saves it to storage alongside the recording and updates the
 * recording metadata and duration.
 *
 * Call repeatedly until status is 'completed' or 'error'.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase, getConversationsBucket } from '../_lib/supabase';
import { jsonResponse, handleError, errorResponse } from '../_lib/response';
import { ErrorCodes, notFound, badRequest } from '../_lib/errors';
import { TranscribeTickSchema, safeParseQuery } from '../_lib/validation';
import { assemblyPollTranscript } from '../_lib/assemblyai';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return errorResponse(res, ErrorCodes.METHOD_NOT_ALLOWED, 'Method not allowed', {
      allowedMethods: ['POST'],
    });
  }

  try {
    const parsed = safeParseQuery(TranscribeTickSchema, req.body);
    if (!parsed.success) {
      return errorResponse(res, ErrorCodes.VALIDATION_ERROR, 'Invalid parameters', {
        fieldErrors: parsed.error.flatten().fieldErrors,
      });
    }
    const { recordingId } = parsed.data;

    // 1. Load recording
    const { data: recording, error: recErr } = await supabase
      .from('anthology_recordings')
      .select('id, metadata, duration_ms')
      .eq('id', recordingId)
      .single();

    if (recErr || !recording) {
      throw notFound('Recording', recordingId);
    }

    const metadata = (recording.metadata || {}) as Record<string, unknown>;
    const status = metadata.transcription_status as string | undefined;
    const assemblyId = metadata.assembly_id as string | undefined;

    // 2. Short-circuit if already terminal
    if (status === 'completed' || status === 'error') {
      return jsonResponse(res, {
        recordingId: recording.id,
        status,
        didWork: false,
        assemblyId: assemblyId || null,
        audioDurationMs: metadata.audio_duration_ms || null,
        transcriptPath: metadata.transcript_path || null,
        error: metadata.transcription_error || null,
      });
    }

    // 3. Guard: must have an assembly_id to poll
    if (!assemblyId) {
      throw badRequest('Recording has no active transcription job (missing assembly_id). Call POST /api/transcribe first.');
    }

    // 4. Ensure API key
    const apiKey = process.env.ASSEMBLYAI_API_KEY || process.env.ASSEMBLY_API_KEY;
    if (!apiKey) {
      return errorResponse(res, ErrorCodes.INTERNAL_ERROR, 'Missing ASSEMBLYAI_API_KEY');
    }

    // 5. Poll AssemblyAI
    const transcript = await assemblyPollTranscript({ apiKey, transcriptId: assemblyId });

    // 6. Handle completed transcript
    if (transcript.status === 'completed') {
      const now = new Date().toISOString();

      // 6a. Compute audio duration in ms
      const audioDurationMs = typeof transcript.audio_duration === 'number'
        ? Math.round(transcript.audio_duration * 1000)
        : null;

      // 6b. Build transcript JSON to save to storage
      const transcriptJson = {
        text: transcript.text || '',
        words: transcript.words || [],
        utterances: transcript.utterances || [],
        audio_duration: transcript.audio_duration,
        assembly_id: assemblyId,
        completed_at: now,
      };

      // 6c. Upload transcript JSON to storage
      const transcriptPath = (metadata.transcript_path as string)
        || `${metadata.object_path}.transcript.json`;
      const bucket = (metadata.bucket as string) || getConversationsBucket();

      const { error: uploadErr } = await supabase.storage
        .from(bucket)
        .upload(transcriptPath, JSON.stringify(transcriptJson, null, 2), {
          contentType: 'application/json',
          upsert: true,
        });

      if (uploadErr) {
        console.error('[POST /api/transcribe/tick] Storage upload error:', uploadErr);
      }

      // 6d. Update recording metadata and duration
      const updatedMetadata = {
        ...metadata,
        transcription_status: 'completed',
        transcript_path: transcriptPath,
        audio_duration_ms: audioDurationMs,
        transcription_error: null,
        transcription_completed_at: now,
      };

      const updatePayload: Record<string, unknown> = { metadata: updatedMetadata };
      if (audioDurationMs !== null) {
        updatePayload.duration_ms = audioDurationMs;
      }

      const { error: updateErr } = await supabase
        .from('anthology_recordings')
        .update(updatePayload)
        .eq('id', recordingId);

      if (updateErr) {
        console.error('[POST /api/transcribe/tick] DB update error:', updateErr);
      }

      return jsonResponse(res, {
        recordingId: recording.id,
        status: 'completed',
        didWork: true,
        assemblyId,
        audioDurationMs,
        transcriptPath,
      });
    }

    // 7. Handle AssemblyAI error
    if (transcript.status === 'error') {
      const updatedMetadata = {
        ...metadata,
        transcription_status: 'error',
        transcription_error: transcript.error || 'Transcription failed',
        transcription_completed_at: new Date().toISOString(),
      };

      await supabase
        .from('anthology_recordings')
        .update({ metadata: updatedMetadata })
        .eq('id', recordingId);

      return jsonResponse(res, {
        recordingId: recording.id,
        status: 'error',
        didWork: true,
        assemblyId,
        error: transcript.error || 'Transcription failed',
      });
    }

    // 8. Still processing (queued or processing)
    return jsonResponse(res, {
      recordingId: recording.id,
      status: 'processing',
      didWork: false,
      assemblyId,
      assemblyStatus: transcript.status,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

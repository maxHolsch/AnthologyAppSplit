/**
 * API endpoint: POST /api/sensemaking/prepare-turns/tick
 *
 * Advance a prepare-turns job by cleaning and merging transcript utterances.
 * Loads the transcript from storage, processes it using cleanAndMergeTurns,
 * and saves the result back to storage.
 *
 * Call once (the work completes in a single tick for now) until status is
 * 'completed' or 'error'.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase, getConversationsBucket } from '../../_lib/supabase';
import { jsonResponse, handleError, errorResponse } from '../../_lib/response';
import { ErrorCodes, notFound, badRequest } from '../../_lib/errors';

type AssemblyUtterance = {
  start: number;
  end: number;
  text: string;
  speaker: string;
  words: Array<{
    text: string;
    start: number;
    end: number;
    confidence?: number;
  }>;
};

type MergedTurn = {
  speaker_label: string;
  start_ms: number;
  end_ms: number;
  text: string;
  words: Array<{
    text: string;
    start_ms: number;
    end_ms: number;
    confidence?: number;
  }>;
};

/**
 * Clean and merge transcript utterances into turns.
 * - Filters out short utterances (<2 seconds)
 * - Merges adjacent same-speaker utterances
 * - Uses word-level timestamps as source of truth for turn boundaries
 */
function cleanAndMergeTurns(utterances: AssemblyUtterance[]): MergedTurn[] {
  const filtered = utterances
    .filter((u) => typeof u.start === 'number' && typeof u.end === 'number')
    .filter((u) => u.end - u.start >= 2000)
    .sort((a, b) => a.start - b.start);

  const merged: MergedTurn[] = [];
  for (const u of filtered) {
    const speaker = String(u.speaker);
    const words = Array.isArray(u.words)
      ? u.words
          .filter((w) => typeof w.start === 'number' && typeof w.end === 'number')
          .map((w) => ({ text: w.text, start_ms: w.start, end_ms: w.end, confidence: w.confidence }))
      : [];

    const last = merged[merged.length - 1];
    if (last && last.speaker_label === speaker) {
      // Adjacent same-speaker utterance -> merge into one turn
      last.end_ms = Math.max(last.end_ms, u.end);
      last.text = `${last.text}${last.text.endsWith(' ') ? '' : ' '}${u.text || ''}`.trim();
      last.words.push(...words);
    } else {
      merged.push({
        speaker_label: speaker,
        start_ms: u.start,
        end_ms: u.end,
        text: (u.text || '').trim(),
        words,
      });
    }
  }

  // Ensure word order within each turn and use word timestamps as source of truth
  for (const t of merged) {
    t.words.sort((a, b) => a.start_ms - b.start_ms);

    // Use word-level timestamps as source of truth
    // This prevents drift from merging logic or AssemblyAI utterance boundaries
    if (t.words.length > 0) {
      const firstWord = t.words[0];
      const lastWord = t.words[t.words.length - 1];

      // Only adjust if word timestamps are available and valid
      if (firstWord?.start_ms != null && lastWord?.end_ms != null) {
        t.start_ms = firstWord.start_ms;
        t.end_ms = lastWord.end_ms;
      }
    }
  }

  return merged;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return errorResponse(res, ErrorCodes.METHOD_NOT_ALLOWED, 'Method not allowed', {
      allowedMethods: ['POST'],
    });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const recordingId = body?.recordingId;

    if (!recordingId || typeof recordingId !== 'string') {
      return errorResponse(res, ErrorCodes.VALIDATION_ERROR, 'Invalid parameters', {
        fieldErrors: { recordingId: ['Required field'] },
      });
    }

    // 1. Load recording
    const { data: recording, error: recErr } = await supabase
      .from('anthology_recordings')
      .select('id, metadata')
      .eq('id', recordingId)
      .single();

    if (recErr || !recording) {
      throw notFound('Recording', recordingId);
    }

    const metadata = (recording.metadata || {}) as Record<string, unknown>;
    const status = metadata.prepare_turns_status as string | undefined;

    // 2. Short-circuit if already terminal
    if (status === 'completed' || status === 'error') {
      return jsonResponse(res, {
        recordingId: recording.id,
        status,
        didWork: false,
        mergedTurnsPath: metadata.merged_turns_path || null,
        turnCount: metadata.merged_turns_count || null,
        error: metadata.prepare_turns_error || null,
      });
    }

    // 3. Guard: must be in processing state
    if (status !== 'processing') {
      throw badRequest(
        'Recording prepare-turns job is not in processing state. Call POST /api/sensemaking/prepare-turns first.'
      );
    }

    const transcriptPath = metadata.transcript_path as string | undefined;
    const mergedTurnsPath = metadata.merged_turns_path as string | undefined;

    if (!transcriptPath || !mergedTurnsPath) {
      throw badRequest('Recording metadata is missing transcript_path or merged_turns_path');
    }

    // 4. Load transcript from storage
    const bucket = (metadata.bucket as string) || getConversationsBucket();
    const { data: transcriptData, error: downloadErr } = await supabase.storage
      .from(bucket)
      .download(transcriptPath);

    if (downloadErr || !transcriptData) {
      throw badRequest(`Failed to download transcript: ${downloadErr?.message || 'unknown'}`);
    }

    const transcriptText = await transcriptData.text();
    const transcript = JSON.parse(transcriptText);

    if (!Array.isArray(transcript.utterances)) {
      throw badRequest('Transcript is missing utterances array');
    }

    // 5. Process: clean and merge turns
    const mergedTurns = cleanAndMergeTurns(transcript.utterances);

    // 6. Log first 3 turns for verification (timestamp drift check)
    console.log('🔍 ========== PREPARE-TURNS VERIFICATION ==========');
    for (let i = 0; i < Math.min(3, mergedTurns.length); i++) {
      const turn = mergedTurns[i];
      const firstWord = turn.words[0];
      const lastWord = turn.words[turn.words.length - 1];
      const startDrift = firstWord ? turn.start_ms - firstWord.start_ms : null;
      const endDrift = lastWord ? turn.end_ms - lastWord.end_ms : null;
      console.log(
        `Turn ${i + 1}: ${startDrift === 0 ? '✅' : '⚠️'} start_drift=${startDrift}ms, end_drift=${endDrift}ms | "${turn.text.slice(0, 40)}..."`
      );
    }
    console.log('🔍 ========== END VERIFICATION ==========');

    // 7. Save merged turns to storage
    const mergedTurnsJson = {
      turns: mergedTurns,
      original_utterance_count: transcript.utterances.length,
      merged_turn_count: mergedTurns.length,
      processed_at: new Date().toISOString(),
      recording_id: recordingId,
    };

    const { error: uploadErr } = await supabase.storage
      .from(bucket)
      .upload(mergedTurnsPath, JSON.stringify(mergedTurnsJson, null, 2), {
        contentType: 'application/json',
        upsert: true,
      });

    if (uploadErr) {
      console.error('[POST /api/sensemaking/prepare-turns/tick] Storage upload error:', uploadErr);
      throw badRequest(`Failed to upload merged turns: ${uploadErr.message}`);
    }

    // 8. Update recording metadata
    const now = new Date().toISOString();
    const updatedMetadata = {
      ...metadata,
      prepare_turns_status: 'completed',
      merged_turns_count: mergedTurns.length,
      prepare_turns_error: null,
      prepare_turns_completed_at: now,
    };

    const { error: updateErr } = await supabase
      .from('anthology_recordings')
      .update({ metadata: updatedMetadata })
      .eq('id', recordingId);

    if (updateErr) {
      console.error('[POST /api/sensemaking/prepare-turns/tick] DB update error:', updateErr);
    }

    // 9. Return success
    return jsonResponse(res, {
      recordingId: recording.id,
      status: 'completed',
      didWork: true,
      mergedTurnsPath,
      turnCount: mergedTurns.length,
      originalUtteranceCount: transcript.utterances.length,
    });
  } catch (error) {
    // Handle errors by updating metadata
    if (error && typeof error === 'object' && 'recordingId' in error) {
      const recordingId = (error as any).recordingId;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      try {
        const { data: recording } = await supabase
          .from('anthology_recordings')
          .select('metadata')
          .eq('id', recordingId)
          .single();

        if (recording) {
          const metadata = (recording.metadata || {}) as Record<string, unknown>;
          const updatedMetadata = {
            ...metadata,
            prepare_turns_status: 'error',
            prepare_turns_error: errorMessage,
            prepare_turns_completed_at: new Date().toISOString(),
          };

          await supabase
            .from('anthology_recordings')
            .update({ metadata: updatedMetadata })
            .eq('id', recordingId);
        }
      } catch (updateErr) {
        console.error('[POST /api/sensemaking/prepare-turns/tick] Failed to update error state:', updateErr);
      }
    }

    return handleError(res, error);
  }
}

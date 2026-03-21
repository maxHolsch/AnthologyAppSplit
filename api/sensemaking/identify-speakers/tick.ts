/**
 * API endpoint: POST /api/sensemaking/identify-speakers/tick
 *
 * Advance an identify-speakers job by calling Claude to infer speaker names
 * from the merged turns. Loads merged turns from storage, runs guessSpeakerNames,
 * and saves the resulting speaker map back to storage.
 *
 * Call once (the work completes in a single tick) until status is
 * 'completed' or 'error'.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase, getConversationsBucket } from '../../_lib/supabase';
import { jsonResponse, handleError, errorResponse } from '../../_lib/response';
import { claudeJsonSchema } from '../../_lib/openai';
import { ErrorCodes, notFound, badRequest } from '../../_lib/errors';

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

type SpeakerNameGuess = {
  speaker_label: string;
  name: string | null;
  confidence: number;
};

const CONFIDENCE_THRESHOLD = 0.7;

/**
 * Use Claude to infer speaker names from merged turns.
 * Returns a speaker map keyed by speaker_label with resolved names.
 * Names below the confidence threshold fall back to "Speaker {label}".
 */
async function guessSpeakerNames({
  apiKey,
  model,
  mergedTurns,
}: {
  apiKey: string;
  model: string;
  mergedTurns: MergedTurn[];
}): Promise<Record<string, { name: string; confidence: number }>> {
  const labels = Array.from(new Set(mergedTurns.map((t) => t.speaker_label)));
  const sample = mergedTurns
    .slice(0, 30)
    .map((t) => `[Speaker ${t.speaker_label}]: ${t.text}`)
    .join('\n');

  const prompt = [
    'You are a careful speech analyst.',
    'Task: infer human speaker names for diarized labels, when possible.',
    '',
    'Return JSON ONLY with this schema:',
    '{"guesses":[{"speaker_label":"string","name":"string|null","confidence":0-1}]}',
    '',
    'Rules:',
    '- Only assign a name if there is a plausible basis in the transcript (self-identification, being addressed, context).',
    '- If uncertain, set name=null and confidence<=0.5.',
    '- Confidence should be calibrated; do not be overconfident.',
    '',
    `Speaker labels: ${labels.join(', ')}`,
    '',
    'Transcript sample:',
    sample,
  ].join('\n');

  const parsed = await claudeJsonSchema<{ guesses: SpeakerNameGuess[] }>({
    apiKey,
    model,
    prompt,
    schemaName: 'speaker_name_guesses',
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        guesses: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              speaker_label: { type: 'string' },
              name: { anyOf: [{ type: 'string' }, { type: 'null' }] },
              confidence: { type: 'number', minimum: 0, maximum: 1 },
            },
            required: ['speaker_label', 'name', 'confidence'],
          },
        },
      },
      required: ['guesses'],
    },
  });

  const out: Record<string, { name: string; confidence: number }> = {};
  for (const guess of parsed.guesses) {
    const resolvedName =
      guess.name && guess.confidence >= CONFIDENCE_THRESHOLD
        ? guess.name
        : `Speaker ${guess.speaker_label}`;
    out[guess.speaker_label] = { name: resolvedName, confidence: guess.confidence };
  }

  // Ensure every label has an entry (even if Claude omitted it)
  for (const label of labels) {
    if (!out[label]) {
      out[label] = { name: `Speaker ${label}`, confidence: 0 };
    }
  }

  return out;
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
    const status = metadata.identify_speakers_status as string | undefined;

    // 2. Short-circuit if already terminal
    if (status === 'completed' || status === 'error') {
      return jsonResponse(res, {
        recordingId: recording.id,
        status,
        didWork: false,
        speakerMapPath: metadata.speaker_map_path || null,
        speakerCount: metadata.speaker_count || null,
        error: metadata.identify_speakers_error || null,
      });
    }

    // 3. Guard: must be in processing state
    if (status !== 'processing') {
      throw badRequest(
        'Recording identify-speakers job is not in processing state. Call POST /api/sensemaking/identify-speakers first.'
      );
    }

    const mergedTurnsPath = metadata.merged_turns_path as string | undefined;
    const speakerMapPath = metadata.speaker_map_path as string | undefined;

    if (!mergedTurnsPath || !speakerMapPath) {
      throw badRequest('Recording metadata is missing merged_turns_path or speaker_map_path');
    }

    // 4. Load merged turns from storage
    const bucket = (metadata.bucket as string) || getConversationsBucket();
    const { data: mergedData, error: downloadErr } = await supabase.storage
      .from(bucket)
      .download(mergedTurnsPath);

    if (downloadErr || !mergedData) {
      throw badRequest(`Failed to download merged turns: ${downloadErr?.message || 'unknown'}`);
    }

    const mergedText = await mergedData.text();
    const mergedJson = JSON.parse(mergedText);

    if (!Array.isArray(mergedJson.turns)) {
      throw badRequest('Merged turns file is missing the turns array');
    }

    const mergedTurns: MergedTurn[] = mergedJson.turns;

    // 5. Resolve Claude credentials
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    }
    const model = process.env.CLAUDE_SENSEMAKING_MODEL || 'claude-haiku-4-5-20251001';

    // 6. Run speaker identification
    console.log('[POST /api/sensemaking/identify-speakers/tick] Calling Claude for speaker names', {
      recordingId,
      model,
      turnCount: mergedTurns.length,
      sampleSize: Math.min(30, mergedTurns.length),
    });

    const speakerMap = await guessSpeakerNames({ apiKey, model, mergedTurns });

    const speakerCount = Object.keys(speakerMap).length;

    console.log('[POST /api/sensemaking/identify-speakers/tick] Speaker identification complete', {
      recordingId,
      speakerCount,
      speakers: Object.entries(speakerMap).map(([label, v]) => `${label}=${v.name}(${v.confidence.toFixed(2)})`),
    });

    // 7. Save speaker map to storage
    const speakerMapJson = {
      speakerMap,
      speakerCount,
      processedAt: new Date().toISOString(),
      recordingId,
    };

    const { error: uploadErr } = await supabase.storage
      .from(bucket)
      .upload(speakerMapPath, JSON.stringify(speakerMapJson, null, 2), {
        contentType: 'application/json',
        upsert: true,
      });

    if (uploadErr) {
      console.error('[POST /api/sensemaking/identify-speakers/tick] Storage upload error:', uploadErr);
      throw badRequest(`Failed to upload speaker map: ${uploadErr.message}`);
    }

    // 8. Update recording metadata
    const now = new Date().toISOString();
    const updatedMetadata = {
      ...metadata,
      identify_speakers_status: 'completed',
      speaker_count: speakerCount,
      identify_speakers_error: null,
      identify_speakers_completed_at: now,
    };

    const { error: updateErr } = await supabase
      .from('anthology_recordings')
      .update({ metadata: updatedMetadata })
      .eq('id', recordingId);

    if (updateErr) {
      console.error('[POST /api/sensemaking/identify-speakers/tick] DB update error:', updateErr);
    }

    // 9. Return success
    return jsonResponse(res, {
      recordingId: recording.id,
      status: 'completed',
      didWork: true,
      speakerMapPath,
      speakerCount,
      speakers: speakerMap,
    });
  } catch (error) {
    // On unhandled error, attempt to mark the job as errored in metadata
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const recordingId = body?.recordingId;
    if (recordingId && typeof recordingId === 'string') {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      try {
        const { data: recording } = await supabase
          .from('anthology_recordings')
          .select('metadata')
          .eq('id', recordingId)
          .single();

        if (recording) {
          const metadata = (recording.metadata || {}) as Record<string, unknown>;
          await supabase
            .from('anthology_recordings')
            .update({
              metadata: {
                ...metadata,
                identify_speakers_status: 'error',
                identify_speakers_error: errorMessage,
                identify_speakers_completed_at: new Date().toISOString(),
              },
            })
            .eq('id', recordingId);
        }
      } catch (updateErr) {
        console.error('[POST /api/sensemaking/identify-speakers/tick] Failed to update error state:', updateErr);
      }
    }

    return handleError(res, error);
  }
}

/**
 * API endpoint: POST /api/sensemaking/create-conversation
 *
 * Create a conversation skeleton from a recording that has completed the
 * transcription, prepare-turns, and identify-speakers steps.
 *
 * Reads the speaker map from storage and creates:
 *   - A conversation row linked to the recording
 *   - Speaker rows (from the identified speaker map)
 *   - Question rows (from the provided list)
 *   - Narrative rows (from the provided list, plus a "Misc" narrative)
 *   - Narrative embeddings (best-effort, requires OPENAI_API_KEY)
 *
 * Idempotent: returns the existing conversation if already created.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase, getConversationsBucket } from '../_lib/supabase';
import { jsonResponse, handleError, errorResponse } from '../_lib/response';
import { ErrorCodes, notFound, badRequest } from '../_lib/errors';
import { buildSpeakerColorScheme } from '../_lib/colorUtils';
import { generateEmbeddings } from '../_lib/openai';

const SPEAKER_PALETTE = [
  '#FF5F1F',
  '#6CB7FA',
  '#CC82E7',
  '#6CC686',
  '#F7ACEA',
  '#FFB84D',
  '#7B68EE',
  '#FF6B6B',
  '#4ECDC4',
  '#95E1D3',
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return errorResponse(res, ErrorCodes.METHOD_NOT_ALLOWED, 'Method not allowed', {
      allowedMethods: ['POST'],
    });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { recordingId, questions = [], narratives = [] } = body ?? {};

    if (!recordingId || typeof recordingId !== 'string') {
      return errorResponse(res, ErrorCodes.VALIDATION_ERROR, 'Invalid parameters', {
        fieldErrors: { recordingId: ['Required field'] },
      });
    }

    if (!Array.isArray(questions) || questions.some((q) => typeof q !== 'string')) {
      return errorResponse(res, ErrorCodes.VALIDATION_ERROR, 'Invalid parameters', {
        fieldErrors: { questions: ['Must be an array of strings'] },
      });
    }

    if (!Array.isArray(narratives) || narratives.some((n) => typeof n !== 'string')) {
      return errorResponse(res, ErrorCodes.VALIDATION_ERROR, 'Invalid parameters', {
        fieldErrors: { narratives: ['Must be an array of strings'] },
      });
    }

    // 1. Load recording
    const { data: recording, error: recErr } = await supabase
      .from('anthology_recordings')
      .select('id, anthology_id, file_name, metadata')
      .eq('id', recordingId)
      .single();

    if (recErr || !recording) {
      throw notFound('Recording', recordingId);
    }

    const metadata = (recording.metadata || {}) as Record<string, unknown>;

    // 2. Guard: identify-speakers must be completed
    if (metadata.identify_speakers_status !== 'completed') {
      throw badRequest(
        `identify-speakers must be completed first. Current status: ${metadata.identify_speakers_status || 'none'}`
      );
    }

    // 3. Idempotent: return existing conversation if already created
    const existingConversationId = metadata.conversation_id as string | undefined;
    if (existingConversationId) {
      return jsonResponse(res, {
        recordingId,
        status: 'completed',
        conversationId: existingConversationId,
        didWork: false,
      });
    }

    const speakerMapPath = metadata.speaker_map_path as string | undefined;
    if (!speakerMapPath) {
      throw badRequest('Recording metadata is missing speaker_map_path');
    }

    // 4. Load speaker map from storage
    const bucket = (metadata.bucket as string) || getConversationsBucket();
    const { data: speakerMapData, error: downloadErr } = await supabase.storage
      .from(bucket)
      .download(speakerMapPath);

    if (downloadErr || !speakerMapData) {
      throw badRequest(`Failed to download speaker map: ${downloadErr?.message || 'unknown'}`);
    }

    const speakerMapJson = JSON.parse(await speakerMapData.text());
    const speakerMap: Record<string, { name: string; confidence: number }> =
      speakerMapJson.speakerMap || {};
    const speakerNames = Object.values(speakerMap).map((v) => v.name);

    // 5. Create conversation
    const title = (recording.file_name || 'Untitled').replace(/\.[^.]+$/, '');
    const convColor = SPEAKER_PALETTE[0];

    const { data: conversation, error: convErr } = await supabase
      .from('anthology_conversations')
      .insert({
        anthology_id: recording.anthology_id,
        title,
        color: convColor,
        participants: speakerNames,
        metadata: { source: 'sensemaking', recording_id: recordingId },
      })
      .select('id')
      .single();

    if (convErr) {
      console.error('[POST /api/sensemaking/create-conversation] Failed to create conversation:', convErr);
      return errorResponse(res, ErrorCodes.DATABASE_ERROR, 'Failed to create conversation');
    }

    const conversationId = conversation.id;

    // 6. Link recording to conversation
    const { error: linkErr } = await supabase
      .from('anthology_conversation_recordings')
      .insert({
        conversation_id: conversationId,
        recording_id: recordingId,
        is_primary: true,
        recording_order: 1,
      });

    if (linkErr) {
      console.error('[POST /api/sensemaking/create-conversation] Failed to link recording:', linkErr);
    }

    // 7. Create speakers from speaker map
    const speakerDbIds: Record<string, string> = {};
    for (const [idx, [label, info]] of Object.entries(speakerMap).entries()) {
      const base = SPEAKER_PALETTE[idx % SPEAKER_PALETTE.length];
      const colors = buildSpeakerColorScheme(base);
      const { data: speaker, error: sErr } = await supabase
        .from('anthology_speakers')
        .insert({
          anthology_id: recording.anthology_id,
          conversation_id: conversationId,
          name: info.name,
          ...colors,
          metadata: { source: 'sensemaking', speaker_label: label },
        })
        .select('id')
        .single();

      if (sErr) {
        console.error('[POST /api/sensemaking/create-conversation] Failed to create speaker:', sErr);
      } else {
        speakerDbIds[label] = speaker.id;
      }
    }

    // 8. Create questions
    const questionDbIds: string[] = [];
    for (const questionText of questions) {
      const { data: qRow, error: qErr } = await supabase
        .from('anthology_questions')
        .insert({
          anthology_id: recording.anthology_id,
          conversation_id: conversationId,
          question_text: questionText,
          metadata: { source: 'sensemaking' },
        })
        .select('id')
        .single();

      if (qErr) {
        console.error('[POST /api/sensemaking/create-conversation] Failed to create question:', qErr);
      } else {
        questionDbIds.push(qRow.id);
      }
    }

    // 9. Create narratives (provided + always a "Misc" catch-all)
    const narrativeDbIds: string[] = [];
    const allNarrativeTexts = [...narratives, 'Misc'];

    for (const narrativeText of allNarrativeTexts) {
      const { data: nRow, error: nErr } = await supabase
        .from('anthology_narratives')
        .insert({
          anthology_id: recording.anthology_id,
          conversation_id: conversationId,
          narrative_text: narrativeText,
        })
        .select('id')
        .single();

      if (nErr) {
        console.error('[POST /api/sensemaking/create-conversation] Failed to create narrative:', nErr);
      } else {
        narrativeDbIds.push(nRow.id);
      }
    }

    // 10. Generate narrative embeddings (best-effort)
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey && narrativeDbIds.length > 0) {
      try {
        const embeddings = await generateEmbeddings({ apiKey: openaiKey, texts: allNarrativeTexts });

        for (let i = 0; i < narrativeDbIds.length; i++) {
          const embedding = embeddings[i];
          if (embedding && embedding.length > 0) {
            await supabase
              .from('anthology_narratives')
              .update({ embedding: `[${embedding.join(',')}]` })
              .eq('id', narrativeDbIds[i]);
          }
        }
      } catch (embErr) {
        console.warn('[POST /api/sensemaking/create-conversation] Embedding generation failed:', embErr);
      }
    }

    // 11. Update recording metadata with conversation_id
    await supabase
      .from('anthology_recordings')
      .update({
        metadata: {
          ...metadata,
          conversation_id: conversationId,
          create_conversation_status: 'completed',
          create_conversation_completed_at: new Date().toISOString(),
        },
      })
      .eq('id', recordingId);

    // 12. Return result
    return jsonResponse(res, {
      recordingId,
      status: 'completed',
      didWork: true,
      conversationId,
      speakerCount: Object.keys(speakerDbIds).length,
      questionCount: questionDbIds.length,
      narrativeCount: narrativeDbIds.length,
      speakerDbIds,
      questionDbIds,
      narrativeDbIds,
    }, 201);
  } catch (error) {
    return handleError(res, error);
  }
}

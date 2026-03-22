/**
 * API endpoint: POST /api/sensemaking/create-responses/tick
 *
 * Advance a create-responses job by reading filtered turns from storage,
 * resolving speaker/question/narrative DB IDs, upserting anthology_responses
 * rows, and generating text embeddings (if OPENAI_API_KEY is set).
 *
 * Idempotent: uses a deterministic legacy_id per turn so retries are safe.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase, getConversationsBucket } from '../../_lib/supabase';
import { jsonResponse, handleError, errorResponse } from '../../_lib/response';
import { generateEmbeddings } from '../../_lib/openai';
import { ErrorCodes, notFound, badRequest } from '../../_lib/errors';

type FilteredTurn = {
  speaker_label: string;
  start_ms: number;
  end_ms: number;
  text: string;
  words: Array<{ text: string; start_ms: number; end_ms: number; confidence?: number }>;
  speaker_name: string;
  question_index: number;
  narrative_index: number;
  standalone_score?: number;
  direct_answer_score?: number;
  keep_reason?: string;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return errorResponse(res, ErrorCodes.METHOD_NOT_ALLOWED, 'Method not allowed', {
      allowedMethods: ['POST'],
    });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const conversationId = body?.conversationId;

    if (!conversationId || typeof conversationId !== 'string') {
      return errorResponse(res, ErrorCodes.VALIDATION_ERROR, 'Invalid parameters', {
        fieldErrors: { conversationId: ['Required field'] },
      });
    }

    const { data: conversation, error: convErr } = await supabase
      .from('anthology_conversations')
      .select('id, anthology_id, metadata')
      .eq('id', conversationId)
      .single();

    if (convErr || !conversation) {
      throw notFound('Conversation', conversationId);
    }

    const convMeta = (conversation.metadata || {}) as Record<string, unknown>;
    const status = convMeta.create_responses_status as string | undefined;

    // Short-circuit if already terminal
    if (status === 'completed' || status === 'error') {
      return jsonResponse(res, {
        conversationId: conversation.id,
        status,
        didWork: false,
        responseCount: convMeta.response_count || null,
        error: convMeta.create_responses_error || null,
      });
    }

    if (status !== 'processing') {
      throw badRequest(
        'Conversation create-responses job is not in processing state. Call POST /api/sensemaking/create-responses first.'
      );
    }

    const filteredTurnsPath = convMeta.filtered_turns_path as string | undefined;
    const recordingId = convMeta.recording_id as string | undefined;
    const anthologyId = conversation.anthology_id as string | undefined;

    if (!filteredTurnsPath || !anthologyId) {
      throw badRequest('Conversation metadata is missing filteredTurnsPath or anthologyId');
    }

    const bucket = (convMeta.bucket as string) || getConversationsBucket();

    // Load filtered turns from storage
    const { data: filteredData, error: filteredErr } = await supabase.storage
      .from(bucket)
      .download(filteredTurnsPath);

    if (filteredErr || !filteredData) {
      throw badRequest(`Failed to download filtered turns: ${filteredErr?.message || 'unknown'}`);
    }

    const filteredJson = JSON.parse(await filteredData.text());
    if (!Array.isArray(filteredJson.turns)) {
      throw badRequest('Filtered turns file is missing the turns array');
    }
    const filteredTurns: FilteredTurn[] = filteredJson.turns;

    if (filteredTurns.length === 0) {
      const now = new Date().toISOString();
      await supabase
        .from('anthology_conversations')
        .update({
          metadata: {
            ...convMeta,
            create_responses_status: 'completed',
            response_count: 0,
            create_responses_error: null,
            create_responses_completed_at: now,
          },
        })
        .eq('id', conversationId);

      return jsonResponse(res, {
        conversationId: conversation.id,
        status: 'completed',
        didWork: true,
        responseCount: 0,
      });
    }

    // Load speakers, questions, narratives from DB to resolve IDs
    const [speakersResult, questionsResult, narrativesResult] = await Promise.all([
      supabase
        .from('anthology_speakers')
        .select('id, name, metadata')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true }),
      supabase
        .from('anthology_questions')
        .select('id, question_text')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true }),
      supabase
        .from('anthology_narratives')
        .select('id, narrative_text')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true }),
    ]);

    if (speakersResult.error) throw badRequest(`Failed to load speakers: ${speakersResult.error.message}`);
    if (questionsResult.error) throw badRequest(`Failed to load questions: ${questionsResult.error.message}`);
    if (narrativesResult.error) throw badRequest(`Failed to load narratives: ${narrativesResult.error.message}`);

    const speakers = speakersResult.data || [];
    const questions = questionsResult.data || [];
    const narratives = narrativesResult.data || [];

    // Build speaker lookup by speaker_label (stored in metadata.speaker_label) and by name
    type Speaker = { id: string; name: string; metadata: Record<string, unknown> | null };
    const speakerByLabel: Record<string, string> = {};
    const speakerByName: Record<string, string> = {};
    for (const s of speakers as Speaker[]) {
      const spMeta = (s.metadata || {}) as Record<string, unknown>;
      if (spMeta.speaker_label && typeof spMeta.speaker_label === 'string') {
        speakerByLabel[spMeta.speaker_label] = s.id;
      }
      speakerByName[s.name] = s.id;
    }

    const questionIds = (questions as { id: string }[]).map((q) => q.id);
    const narrativeIds = (narratives as { id: string }[]).map((n) => n.id);
    const miscNarrativeId = narrativeIds[narrativeIds.length - 1]; // "Misc" is always last

    console.log('[POST /api/sensemaking/create-responses/tick] Upserting responses', {
      conversationId,
      filteredTurnCount: filteredTurns.length,
      speakerCount: speakers.length,
      questionCount: questions.length,
      narrativeCount: narratives.length,
    });

    // Build response rows
    const rows = filteredTurns.map((t, idx) => {
      const turnNumber = idx + 1;
      const questionId = questionIds[t.question_index] || questionIds[0];
      const narrativeId = narrativeIds[t.narrative_index] ?? miscNarrativeId;
      const speakerId =
        speakerByLabel[t.speaker_label] || speakerByName[t.speaker_name] || null;
      const legacyId = `sensemaking:${conversationId}:${turnNumber}`;

      return {
        anthology_id: anthologyId,
        legacy_id: legacyId,
        conversation_id: conversationId,
        responds_to_question_id: questionId,
        responds_to_narrative_id: narrativeId,
        speaker_id: speakerId,
        speaker_name: t.speaker_name,
        speaker_text: t.text,
        recording_id: recordingId || null,
        audio_start_ms: t.start_ms,
        audio_end_ms: t.end_ms,
        turn_number: turnNumber,
        medium: 'audio',
        synchronicity: 'sync',
        metadata: {
          source: 'sensemaking',
          speaker_label: t.speaker_label,
          question_index: t.question_index,
          standalone_score: t.standalone_score,
          direct_answer_score: t.direct_answer_score,
          keep_reason: t.keep_reason,
        },
      };
    });

    const { error: upsertErr } = await supabase
      .from('anthology_responses')
      .upsert(rows, { onConflict: 'anthology_id,legacy_id' });

    if (upsertErr) {
      throw badRequest(`Failed to upsert responses: ${upsertErr.message}`);
    }

    console.log('[POST /api/sensemaking/create-responses/tick] Upserted', rows.length, 'responses');

    // Generate response text embeddings (best-effort, requires OPENAI_API_KEY)
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey && filteredTurns.length > 0) {
      try {
        const texts = filteredTurns.map((t) => t.text);
        const embeddings = await generateEmbeddings({ apiKey: openaiKey, texts });

        for (let idx = 0; idx < filteredTurns.length; idx++) {
          const turnNumber = idx + 1;
          const legacyId = `sensemaking:${conversationId}:${turnNumber}`;
          const embedding = embeddings[idx];

          if (embedding && embedding.length > 0) {
            await supabase
              .from('anthology_responses')
              .update({ embedding: `[${embedding.join(',')}]` })
              .eq('anthology_id', anthologyId)
              .eq('legacy_id', legacyId);
          }
        }

        console.log('[POST /api/sensemaking/create-responses/tick] Embeddings stored for', filteredTurns.length, 'responses');
      } catch (embErr) {
        console.warn('[POST /api/sensemaking/create-responses/tick] Embedding generation failed:', embErr);
      }
    }

    // Update conversation metadata
    const now = new Date().toISOString();
    const { error: updateErr } = await supabase
      .from('anthology_conversations')
      .update({
        metadata: {
          ...convMeta,
          create_responses_status: 'completed',
          response_count: rows.length,
          create_responses_error: null,
          create_responses_completed_at: now,
        },
      })
      .eq('id', conversationId);

    if (updateErr) {
      console.error('[POST /api/sensemaking/create-responses/tick] DB update error:', updateErr);
    }

    return jsonResponse(res, {
      conversationId: conversation.id,
      status: 'completed',
      didWork: true,
      responseCount: rows.length,
      embeddingsGenerated: !!openaiKey,
    });
  } catch (error) {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const conversationId = body?.conversationId;
    if (conversationId && typeof conversationId === 'string') {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      try {
        const { data: conv } = await supabase
          .from('anthology_conversations')
          .select('metadata')
          .eq('id', conversationId)
          .single();

        if (conv) {
          const md = (conv.metadata || {}) as Record<string, unknown>;
          await supabase
            .from('anthology_conversations')
            .update({
              metadata: {
                ...md,
                create_responses_status: 'error',
                create_responses_error: errorMessage,
                create_responses_completed_at: new Date().toISOString(),
              },
            })
            .eq('id', conversationId);
        }
      } catch (updateErr) {
        console.error('[POST /api/sensemaking/create-responses/tick] Failed to update error state:', updateErr);
      }
    }

    return handleError(res, error);
  }
}

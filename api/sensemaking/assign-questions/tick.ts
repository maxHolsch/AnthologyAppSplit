/**
 * API endpoint: POST /api/sensemaking/assign-questions/tick
 *
 * Advance an assign-questions job by calling Claude to assign each merged turn
 * to its best-matching question. Loads merged turns and speaker map from storage,
 * fetches questions from the DB, runs Claude in batches of 30 turns, and saves
 * the resulting assigned-turns JSON back to storage.
 *
 * Call once per HTTP request (batching is done internally). Returns
 * status='completed' when all turns have been assigned.
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

type TurnLite = { speaker_label: string; start_ms: number; end_ms: number; text: string };

type AssignedQuestionTurn = MergedTurn & {
  speaker_name: string;
  question_index: number;
};

const BATCH_SIZE = 30;

async function assignQuestionsToTurnsBatch({
  apiKey,
  model,
  templateQuestions,
  turns,
  offset,
}: {
  apiKey: string;
  model: string;
  templateQuestions: string[];
  turns: TurnLite[];
  offset: number;
}): Promise<number[]> {
  if (turns.length === 0) return [];

  const prompt = [
    'You are a routing judge that assigns each speaker turn to the SINGLE best matching template question.',
    '',
    'Return JSON ONLY with schema:',
    '{"results":[{"idx":number,"best_index":number,"reason":"string"}]}',
    '',
    'Rules:',
    '- idx refers to the item index (0..N-1) within this batch.',
    '- best_index must be a valid template question index (0-based).',
    '',
    'Template questions (index: text):',
    ...templateQuestions.map((q, idx) => `${idx}: ${q}`),
    '',
    'Turns:',
    ...turns.map((t, i) => `#${i} (global_turn=${offset + i}) [Speaker ${t.speaker_label}]: ${t.text}`),
  ].join('\n');

  const parsed = await claudeJsonSchema<{
    results: Array<{ idx: number; best_index: number; reason: string }>;
  }>({
    apiKey,
    model,
    prompt,
    schemaName: 'turn_question_routing',
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        results: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              idx: { type: 'integer', minimum: 0 },
              best_index: { type: 'integer', minimum: 0, maximum: Math.max(0, templateQuestions.length - 1) },
              reason: { type: 'string' },
            },
            required: ['idx', 'best_index', 'reason'],
          },
        },
      },
      required: ['results'],
    },
  });

  const out = new Array<number>(turns.length).fill(0);
  for (const r of parsed.results || []) {
    if (typeof r?.idx !== 'number') continue;
    const i = r.idx;
    if (i < 0 || i >= turns.length) continue;
    const best = Number.isInteger(r.best_index) ? r.best_index : 0;
    out[i] = Math.min(Math.max(best, 0), templateQuestions.length - 1);
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
    const conversationId = body?.conversationId;

    if (!conversationId || typeof conversationId !== 'string') {
      return errorResponse(res, ErrorCodes.VALIDATION_ERROR, 'Invalid parameters', {
        fieldErrors: { conversationId: ['Required field'] },
      });
    }

    const { data: conversation, error: convErr } = await supabase
      .from('anthology_conversations')
      .select('id, metadata')
      .eq('id', conversationId)
      .single();

    if (convErr || !conversation) {
      throw notFound('Conversation', conversationId);
    }

    const convMeta = (conversation.metadata || {}) as Record<string, unknown>;
    const status = convMeta.assign_questions_status as string | undefined;

    // Short-circuit if already terminal
    if (status === 'completed' || status === 'error') {
      return jsonResponse(res, {
        conversationId: conversation.id,
        status,
        didWork: false,
        assignedQuestionsPath: convMeta.assigned_questions_path || null,
        turnCount: convMeta.assign_questions_turn_count || null,
        error: convMeta.assign_questions_error || null,
      });
    }

    if (status !== 'processing') {
      throw badRequest(
        'Conversation assign-questions job is not in processing state. Call POST /api/sensemaking/assign-questions first.'
      );
    }

    const mergedTurnsPath = convMeta.merged_turns_path as string | undefined;
    const speakerMapPath = convMeta.speaker_map_path as string | undefined;
    const assignedQuestionsPath = convMeta.assigned_questions_path as string | undefined;

    if (!mergedTurnsPath || !speakerMapPath || !assignedQuestionsPath) {
      throw badRequest('Conversation metadata is missing required paths');
    }

    const bucket = (convMeta.bucket as string) || getConversationsBucket();

    // Load merged turns from storage
    const { data: mergedData, error: mergedErr } = await supabase.storage
      .from(bucket)
      .download(mergedTurnsPath);

    if (mergedErr || !mergedData) {
      throw badRequest(`Failed to download merged turns: ${mergedErr?.message || 'unknown'}`);
    }

    const mergedJson = JSON.parse(await mergedData.text());
    if (!Array.isArray(mergedJson.turns)) {
      throw badRequest('Merged turns file is missing the turns array');
    }
    const mergedTurns: MergedTurn[] = mergedJson.turns;

    // Load speaker map from storage
    const { data: speakerData, error: speakerErr } = await supabase.storage
      .from(bucket)
      .download(speakerMapPath);

    if (speakerErr || !speakerData) {
      throw badRequest(`Failed to download speaker map: ${speakerErr?.message || 'unknown'}`);
    }

    const speakerMapJson = JSON.parse(await speakerData.text());
    const speakerMap: Record<string, { name: string; confidence: number }> =
      speakerMapJson.speakerMap || {};

    // Load questions from DB
    const { data: questions, error: qErr } = await supabase
      .from('anthology_questions')
      .select('id, question_text')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (qErr) {
      throw badRequest(`Failed to load questions: ${qErr.message}`);
    }

    if (!questions || questions.length === 0) {
      throw badRequest('No questions found for this conversation. Create questions first via create-conversation.');
    }

    const questionTexts = questions.map((q: { id: string; question_text: string }) => q.question_text);

    // Add speaker_name to each turn
    const turnsWithNames = mergedTurns.map((turn) => ({
      ...turn,
      speaker_name: speakerMap[turn.speaker_label]?.name || `Speaker ${turn.speaker_label}`,
    }));

    // Resolve Claude credentials
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    }
    const model = process.env.CLAUDE_SENSEMAKING_MODEL || 'claude-haiku-4-5-20251001';

    console.log('[POST /api/sensemaking/assign-questions/tick] Assigning questions to turns', {
      conversationId,
      model,
      turnCount: mergedTurns.length,
      questionCount: questionTexts.length,
    });

    // Assign questions in batches
    const allQuestionIndices: number[] = [];
    for (let offset = 0; offset < turnsWithNames.length; offset += BATCH_SIZE) {
      const batch = turnsWithNames.slice(offset, offset + BATCH_SIZE);
      const turnLites: TurnLite[] = batch.map((t) => ({
        speaker_label: t.speaker_label,
        start_ms: t.start_ms,
        end_ms: t.end_ms,
        text: t.text,
      }));

      const indices = await assignQuestionsToTurnsBatch({
        apiKey,
        model,
        templateQuestions: questionTexts,
        turns: turnLites,
        offset,
      });
      allQuestionIndices.push(...indices);
    }

    // Build assigned turns
    const assignedTurns: AssignedQuestionTurn[] = turnsWithNames.map((turn, i) => ({
      ...turn,
      question_index: allQuestionIndices[i] ?? 0,
    }));

    console.log('[POST /api/sensemaking/assign-questions/tick] Question assignment complete', {
      conversationId,
      turnCount: assignedTurns.length,
    });

    // Save assigned turns to storage
    const assignedJson = {
      conversationId,
      processedAt: new Date().toISOString(),
      questionCount: questionTexts.length,
      turnCount: assignedTurns.length,
      turns: assignedTurns,
    };

    const { error: uploadErr } = await supabase.storage
      .from(bucket)
      .upload(assignedQuestionsPath, JSON.stringify(assignedJson, null, 2), {
        contentType: 'application/json',
        upsert: true,
      });

    if (uploadErr) {
      throw badRequest(`Failed to upload assigned questions: ${uploadErr.message}`);
    }

    // Update conversation metadata
    const now = new Date().toISOString();
    const { error: updateErr } = await supabase
      .from('anthology_conversations')
      .update({
        metadata: {
          ...convMeta,
          assign_questions_status: 'completed',
          assign_questions_turn_count: assignedTurns.length,
          assign_questions_error: null,
          assign_questions_completed_at: now,
        },
      })
      .eq('id', conversationId);

    if (updateErr) {
      console.error('[POST /api/sensemaking/assign-questions/tick] DB update error:', updateErr);
    }

    return jsonResponse(res, {
      conversationId: conversation.id,
      status: 'completed',
      didWork: true,
      assignedQuestionsPath,
      turnCount: assignedTurns.length,
      questionCount: questionTexts.length,
    });
  } catch (error) {
    // Attempt to mark job as errored
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
                assign_questions_status: 'error',
                assign_questions_error: errorMessage,
                assign_questions_completed_at: new Date().toISOString(),
              },
            })
            .eq('id', conversationId);
        }
      } catch (updateErr) {
        console.error('[POST /api/sensemaking/assign-questions/tick] Failed to update error state:', updateErr);
      }
    }

    return handleError(res, error);
  }
}

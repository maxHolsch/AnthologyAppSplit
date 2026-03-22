/**
 * API endpoint: POST /api/sensemaking/filter-turns/tick
 *
 * Advance a filter-turns job by calling Claude to score each turn for
 * standalone coherence and direct relevance to its assigned question.
 * Currently all turns are kept (thresholds disabled) but scores are recorded
 * in metadata for transparency. Saves the filtered-turns JSON to storage.
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

type AssignedNarrativeTurn = MergedTurn & {
  speaker_name: string;
  question_index: number;
  narrative_index: number;
};

type FilteredTurn = AssignedNarrativeTurn & {
  standalone_score?: number;
  direct_answer_score?: number;
  keep_reason?: string;
};

async function filterTurns({
  apiKey,
  model,
  templateQuestions,
  turns,
}: {
  apiKey: string;
  model: string;
  templateQuestions: string[];
  turns: AssignedNarrativeTurn[];
}): Promise<FilteredTurn[]> {
  if (turns.length === 0) return [];

  const items = turns.map((t, idx) => {
    const q = templateQuestions[t.question_index] || templateQuestions[0] || '';
    return { idx, speaker: t.speaker_name, question: q, text: t.text };
  });

  const prompt = [
    'You are filtering diarized speaker turns to decide which ones should become RESPONSE nodes in a Q/A anthology graph.',
    '',
    'For EACH item, decide whether to KEEP it based on BOTH criteria:',
    '1) The turn is fairly understandable on its own (standalone).',
    '2) The turn directly responds to the given question (not facilitation, chatter, meta-comments, or off-topic).',
    '',
    'Return JSON ONLY with schema:',
    '{"results":[{"idx":number,"keep":boolean,"standalone_score":0-1,"direct_answer_score":0-1,"reason":"string"}]}',
    '',
    'Guidelines:',
    '- keep=false for: short acknowledgements, filler, facilitation prompts, cross-talk, repetitions, or unclear fragments.',
    '- keep=false if it is not a direct answer to the question even if coherent.',
    '- If uncertain, keep=false.',
    '',
    'Items:',
    ...items.map((it) => `#${it.idx}\nQuestion: ${it.question}\nSpeaker: ${it.speaker}\nTurn: ${it.text}`),
  ].join('\n');

  const parsed = await claudeJsonSchema<{
    results: Array<{
      idx: number;
      keep: boolean;
      standalone_score: number;
      direct_answer_score: number;
      reason: string;
    }>;
  }>({
    apiKey,
    model,
    prompt,
    schemaName: 'turn_filter',
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
              keep: { type: 'boolean' },
              standalone_score: { type: 'number', minimum: 0, maximum: 1 },
              direct_answer_score: { type: 'number', minimum: 0, maximum: 1 },
              reason: { type: 'string' },
            },
            required: ['idx', 'keep', 'standalone_score', 'direct_answer_score', 'reason'],
          },
        },
      },
      required: ['results'],
    },
    maxOutputTokens: 4000,
  });

  const byIdx = new Map<number, (typeof parsed.results)[number]>();
  for (const r of parsed.results || []) {
    if (typeof r?.idx === 'number') byIdx.set(r.idx, r);
  }

  // Keep all turns — thresholds disabled. Scores are recorded for transparency.
  const out: FilteredTurn[] = [];
  for (let idx = 0; idx < turns.length; idx++) {
    const t = turns[idx];
    const r = byIdx.get(idx);
    out.push({
      ...t,
      standalone_score: typeof r?.standalone_score === 'number' ? r.standalone_score : undefined,
      direct_answer_score: typeof r?.direct_answer_score === 'number' ? r.direct_answer_score : undefined,
      keep_reason: typeof r?.reason === 'string' ? r.reason : undefined,
    });
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
    const status = convMeta.filter_turns_status as string | undefined;

    // Short-circuit if already terminal
    if (status === 'completed' || status === 'error') {
      return jsonResponse(res, {
        conversationId: conversation.id,
        status,
        didWork: false,
        filteredTurnsPath: convMeta.filtered_turns_path || null,
        filteredTurnsCount: convMeta.filtered_turns_count || null,
        error: convMeta.filter_turns_error || null,
      });
    }

    if (status !== 'processing') {
      throw badRequest(
        'Conversation filter-turns job is not in processing state. Call POST /api/sensemaking/filter-turns first.'
      );
    }

    const assignedNarrativesPath = convMeta.assigned_narratives_path as string | undefined;
    const filteredTurnsPath = convMeta.filtered_turns_path as string | undefined;

    if (!assignedNarrativesPath || !filteredTurnsPath) {
      throw badRequest('Conversation metadata is missing required paths');
    }

    const bucket = (convMeta.bucket as string) || getConversationsBucket();

    // Load assigned-narrative turns from storage
    const { data: assignedData, error: assignedErr } = await supabase.storage
      .from(bucket)
      .download(assignedNarrativesPath);

    if (assignedErr || !assignedData) {
      throw badRequest(`Failed to download assigned narratives: ${assignedErr?.message || 'unknown'}`);
    }

    const assignedJson = JSON.parse(await assignedData.text());
    if (!Array.isArray(assignedJson.turns)) {
      throw badRequest('Assigned narratives file is missing the turns array');
    }
    const assignedTurns: AssignedNarrativeTurn[] = assignedJson.turns;

    // Load questions from DB for the filter prompt
    const { data: questions, error: qErr } = await supabase
      .from('anthology_questions')
      .select('question_text')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (qErr) {
      throw badRequest(`Failed to load questions: ${qErr.message}`);
    }

    const questionTexts = (questions || []).map((q: { question_text: string }) => q.question_text);

    // Resolve Claude credentials
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    }
    const model = process.env.CLAUDE_SENSEMAKING_MODEL || 'claude-haiku-4-5-20251001';

    console.log('[POST /api/sensemaking/filter-turns/tick] Filtering turns with Claude', {
      conversationId,
      model,
      turnCount: assignedTurns.length,
    });

    const filteredTurns = await filterTurns({
      apiKey,
      model,
      templateQuestions: questionTexts,
      turns: assignedTurns,
    });

    console.log('[POST /api/sensemaking/filter-turns/tick] Filter complete', {
      conversationId,
      totalTurns: assignedTurns.length,
      keptTurns: filteredTurns.length,
    });

    // Save filtered turns to storage
    const outputJson = {
      conversationId,
      processedAt: new Date().toISOString(),
      totalTurns: assignedTurns.length,
      keptTurns: filteredTurns.length,
      turns: filteredTurns,
    };

    const { error: uploadErr } = await supabase.storage
      .from(bucket)
      .upload(filteredTurnsPath, JSON.stringify(outputJson, null, 2), {
        contentType: 'application/json',
        upsert: true,
      });

    if (uploadErr) {
      throw badRequest(`Failed to upload filtered turns: ${uploadErr.message}`);
    }

    // Update conversation metadata
    const now = new Date().toISOString();
    const { error: updateErr } = await supabase
      .from('anthology_conversations')
      .update({
        metadata: {
          ...convMeta,
          filter_turns_status: 'completed',
          filtered_turns_count: filteredTurns.length,
          filter_turns_error: null,
          filter_turns_completed_at: now,
        },
      })
      .eq('id', conversationId);

    if (updateErr) {
      console.error('[POST /api/sensemaking/filter-turns/tick] DB update error:', updateErr);
    }

    return jsonResponse(res, {
      conversationId: conversation.id,
      status: 'completed',
      didWork: true,
      filteredTurnsPath,
      totalTurns: assignedTurns.length,
      keptTurns: filteredTurns.length,
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
                filter_turns_status: 'error',
                filter_turns_error: errorMessage,
                filter_turns_completed_at: new Date().toISOString(),
              },
            })
            .eq('id', conversationId);
        }
      } catch (updateErr) {
        console.error('[POST /api/sensemaking/filter-turns/tick] Failed to update error state:', updateErr);
      }
    }

    return handleError(res, error);
  }
}

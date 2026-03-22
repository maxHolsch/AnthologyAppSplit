/**
 * API endpoint: POST /api/sensemaking/assign-narratives/tick
 *
 * Advance an assign-narratives job by computing embedding cosine similarity
 * between each turn and the conversation narratives. Generates embeddings for
 * turn texts and narratives (if not already set), then assigns narrative_index
 * to each turn. Saves the resulting assigned-narratives JSON to storage.
 *
 * Requires OPENAI_API_KEY for embedding generation. If not set, all turns
 * are assigned to the last narrative ("Misc").
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase, getConversationsBucket } from '../../_lib/supabase';
import { jsonResponse, handleError, errorResponse } from '../../_lib/response';
import { generateEmbeddings } from '../../_lib/openai';
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

type AssignedQuestionTurn = MergedTurn & {
  speaker_name: string;
  question_index: number;
};

type AssignedNarrativeTurn = AssignedQuestionTurn & {
  narrative_index: number;
};

function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length || vecA.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

function parseEmbedding(raw: unknown): number[] {
  if (Array.isArray(raw)) return raw as number[];
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw.replace(/^\[/, '[').replace(/\]$/, ']'));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
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
    const status = convMeta.assign_narratives_status as string | undefined;

    // Short-circuit if already terminal
    if (status === 'completed' || status === 'error') {
      return jsonResponse(res, {
        conversationId: conversation.id,
        status,
        didWork: false,
        assignedNarrativesPath: convMeta.assigned_narratives_path || null,
        turnCount: convMeta.assign_narratives_turn_count || null,
        error: convMeta.assign_narratives_error || null,
      });
    }

    if (status !== 'processing') {
      throw badRequest(
        'Conversation assign-narratives job is not in processing state. Call POST /api/sensemaking/assign-narratives first.'
      );
    }

    const assignedQuestionsPath = convMeta.assigned_questions_path as string | undefined;
    const assignedNarrativesPath = convMeta.assigned_narratives_path as string | undefined;

    if (!assignedQuestionsPath || !assignedNarrativesPath) {
      throw badRequest('Conversation metadata is missing required paths');
    }

    const bucket = (convMeta.bucket as string) || getConversationsBucket();

    // Load assigned-question turns from storage
    const { data: assignedData, error: assignedErr } = await supabase.storage
      .from(bucket)
      .download(assignedQuestionsPath);

    if (assignedErr || !assignedData) {
      throw badRequest(`Failed to download assigned questions: ${assignedErr?.message || 'unknown'}`);
    }

    const assignedJson = JSON.parse(await assignedData.text());
    if (!Array.isArray(assignedJson.turns)) {
      throw badRequest('Assigned questions file is missing the turns array');
    }
    const assignedTurns: AssignedQuestionTurn[] = assignedJson.turns;

    // Load narratives from DB
    const { data: narratives, error: nErr } = await supabase
      .from('anthology_narratives')
      .select('id, narrative_text, embedding')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (nErr) {
      throw badRequest(`Failed to load narratives: ${nErr.message}`);
    }

    if (!narratives || narratives.length === 0) {
      throw badRequest('No narratives found for this conversation.');
    }

    const miscIndex = narratives.length - 1; // "Misc" is always last
    const openaiKey = process.env.OPENAI_API_KEY;

    let narrativeAssignments: number[];

    if (!openaiKey) {
      // No OpenAI key — assign all turns to Misc
      console.warn('[POST /api/sensemaking/assign-narratives/tick] No OPENAI_API_KEY set — assigning all turns to Misc');
      narrativeAssignments = assignedTurns.map(() => miscIndex);
    } else {
      // Parse existing narrative embeddings
      let narrativeEmbeddings: number[][] = narratives.map((n: { id: string; narrative_text: string; embedding: unknown }) =>
        parseEmbedding(n.embedding)
      );

      // Generate any missing narrative embeddings
      const missingNarrativeIndices = narrativeEmbeddings
        .map((emb, i) => (emb.length === 0 ? i : -1))
        .filter((i) => i >= 0);

      if (missingNarrativeIndices.length > 0) {
        console.log('[POST /api/sensemaking/assign-narratives/tick] Generating missing narrative embeddings', {
          missingCount: missingNarrativeIndices.length,
        });

        const missingTexts = missingNarrativeIndices.map((i) => narratives[i].narrative_text);
        const newEmbeddings = await generateEmbeddings({ apiKey: openaiKey, texts: missingTexts });

        for (let j = 0; j < missingNarrativeIndices.length; j++) {
          const idx = missingNarrativeIndices[j];
          narrativeEmbeddings[idx] = newEmbeddings[j] || [];

          // Save back to DB (best-effort)
          if (newEmbeddings[j] && newEmbeddings[j].length > 0) {
            await supabase
              .from('anthology_narratives')
              .update({ embedding: `[${newEmbeddings[j].join(',')}]` })
              .eq('id', narratives[idx].id);
          }
        }
      }

      // Generate turn embeddings
      const turnTexts = assignedTurns.map((t) => t.text);
      console.log('[POST /api/sensemaking/assign-narratives/tick] Generating turn embeddings', {
        conversationId,
        turnCount: turnTexts.length,
      });

      const turnEmbeddings = await generateEmbeddings({ apiKey: openaiKey, texts: turnTexts });

      // Assign narrative to each turn via cosine similarity
      const SIMILARITY_THRESHOLD = 0.25;
      narrativeAssignments = turnEmbeddings.map((turnEmb, turnIdx) => {
        if (!turnEmb || turnEmb.length === 0) return miscIndex;

        let bestSim = -1;
        let bestIdx = miscIndex;

        // Compare against all narratives except "Misc" (last)
        for (let ni = 0; ni < narrativeEmbeddings.length - 1; ni++) {
          const narrativeEmb = narrativeEmbeddings[ni];
          if (!narrativeEmb || narrativeEmb.length === 0) continue;

          const sim = cosineSimilarity(turnEmb, narrativeEmb);
          if (sim > bestSim) {
            bestSim = sim;
            bestIdx = ni;
          }
        }

        if (bestSim < SIMILARITY_THRESHOLD) {
          console.log(`[assign-narratives/tick] Turn ${turnIdx}: similarity ${bestSim.toFixed(3)} below threshold, → Misc`);
          return miscIndex;
        }

        return bestIdx;
      });
    }

    // Build assigned-narrative turns
    const assignedNarrativeTurns: AssignedNarrativeTurn[] = assignedTurns.map((turn, i) => ({
      ...turn,
      narrative_index: narrativeAssignments[i] ?? miscIndex,
    }));

    console.log('[POST /api/sensemaking/assign-narratives/tick] Narrative assignment complete', {
      conversationId,
      turnCount: assignedNarrativeTurns.length,
    });

    // Save to storage
    const outputJson = {
      conversationId,
      processedAt: new Date().toISOString(),
      narrativeCount: narratives.length,
      turnCount: assignedNarrativeTurns.length,
      turns: assignedNarrativeTurns,
    };

    const { error: uploadErr } = await supabase.storage
      .from(bucket)
      .upload(assignedNarrativesPath, JSON.stringify(outputJson, null, 2), {
        contentType: 'application/json',
        upsert: true,
      });

    if (uploadErr) {
      throw badRequest(`Failed to upload assigned narratives: ${uploadErr.message}`);
    }

    // Update conversation metadata
    const now = new Date().toISOString();
    const { error: updateErr } = await supabase
      .from('anthology_conversations')
      .update({
        metadata: {
          ...convMeta,
          assign_narratives_status: 'completed',
          assign_narratives_turn_count: assignedNarrativeTurns.length,
          assign_narratives_error: null,
          assign_narratives_completed_at: now,
        },
      })
      .eq('id', conversationId);

    if (updateErr) {
      console.error('[POST /api/sensemaking/assign-narratives/tick] DB update error:', updateErr);
    }

    return jsonResponse(res, {
      conversationId: conversation.id,
      status: 'completed',
      didWork: true,
      assignedNarrativesPath,
      turnCount: assignedNarrativeTurns.length,
      narrativeCount: narratives.length,
      usedEmbeddings: !!openaiKey,
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
                assign_narratives_status: 'error',
                assign_narratives_error: errorMessage,
                assign_narratives_completed_at: new Date().toISOString(),
              },
            })
            .eq('id', conversationId);
        }
      } catch (updateErr) {
        console.error('[POST /api/sensemaking/assign-narratives/tick] Failed to update error state:', updateErr);
      }
    }

    return handleError(res, error);
  }
}

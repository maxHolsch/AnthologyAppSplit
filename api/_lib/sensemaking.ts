import { createClient } from '@supabase/supabase-js';
import path from 'path';

import { openaiJsonSchema, generateEmbeddings } from './openai';
import {
  assemblyPollTranscript,
  assemblyStartTranscription,
  type AssemblyTranscript,
  type AssemblyUtterance,
} from './assemblyai';

// LangGraph note: we orchestrate the pipeline with a time-sliced job runner in tickSensemaking()
// (kept intentionally minimal for Vercel function timeouts).

// --------------------------------------------
// Env + Supabase
// --------------------------------------------

const CONVERSATIONS_BUCKET = process.env.VITE_SUPABASE_CONVERSATIONS_BUCKET || 'Conversations';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} env var`);
  return v;
}

function getSupabaseServiceClient() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  if (!url) throw new Error('Missing VITE_SUPABASE_URL (or SUPABASE_URL) env var');

  // Prefer SUPABASE_SERVICE_KEY (used elsewhere in this repo)
  const serviceKey =
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE;

  if (!serviceKey) throw new Error('Missing SUPABASE_SERVICE_KEY env var');
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function nowIso() {
  return new Date().toISOString();
}

// --------------------------------------------
// Types
// --------------------------------------------

export type SensemakingJobStatus = 'queued' | 'running' | 'done' | 'error';

export type SensemakingFileStep =
  | 'pending'
  | 'transcription_queued'
  | 'transcribing'
  | 'transcript_ready'
  | 'cleaning_short_turns'
  | 'speaker_naming'
  | 'question_assignment'
  | 'turn_filtering'
  | 'uploading_nodes'
  | 'done'
  | 'error';

export type JobProgress = {
  overall?: { done: number; total: number };
  files?: Record<
    string,
    {
      step: SensemakingFileStep;
      message?: string;
      updated_at?: string;
      assembly_id?: string;
      conversation_id?: string;
      recording_id?: string;
      // --- time-sliced pipeline state (for long recordings)
      cursor?: number; // how many merged turns we’ve processed
      total_turns?: number;
      merged_turns?: Array<{ speaker_label: string; start_ms: number; end_ms: number; text: string }>;
      speaker_map?: Record<string, { name: string; confidence: number }>;
      question_db_ids?: string[];
      narrative_db_ids?: string[];
      speaker_db_ids?: Record<string, string>; // speaker_name -> uuid
      // allow forward-compatible fields
      [key: string]: any;
    }
  >;
};

export type StartRequest = {
  anthologySlug: string;
  anthologyTitle: string;
  templateQuestions: string[];
  templateNarratives: string[];
  uploadedFilePaths: string[]; // storage object paths
  includePreviousUploads: boolean;
};

export type StartResponse = {
  jobId: string;
  anthologySlug: string;
  anthologyId: string;
};

export type StatusResponse = {
  jobId: string;
  status: SensemakingJobStatus;
  anthologySlug: string;
  anthologyId: string;
  progress: JobProgress;
  error?: string;
};

export type TickResponse = StatusResponse & { didWork: boolean };

// --------------------------------------------
// Helpers: progress mutation
// --------------------------------------------

function ensureProgress(progress: any, filePaths: string[]): JobProgress {
  const p: JobProgress = (progress && typeof progress === 'object' ? progress : {}) as JobProgress;
  p.files = p.files && typeof p.files === 'object' ? p.files : {};

  for (const fp of filePaths) {
    if (!p.files[fp]) {
      p.files[fp] = { step: 'pending', updated_at: nowIso() };
    }
  }

  const done = Object.values(p.files).filter((f) => f.step === 'done').length;
  p.overall = { done, total: filePaths.length };
  return p;
}

function setFileStep(progress: JobProgress, filePath: string, step: SensemakingFileStep, message?: string) {
  progress.files = progress.files || {};
  const prev: any = progress.files[filePath] || { step: 'pending' };
  const startedAt = prev.started_at || (step === 'transcribing' ? nowIso() : undefined);

  progress.files[filePath] = {
    ...prev,
    step,
    message,
    updated_at: nowIso(),
    ...(startedAt ? { started_at: startedAt } : null),
  };
}

// --------------------------------------------
// Storage utilities
// --------------------------------------------

async function listConversationFolderObjectPaths(supabase: any, anthologySlug: string): Promise<string[]> {
  const prefix = `upload_conversations/${anthologySlug}`;
  const out: string[] = [];

  const { data, error } = await supabase.storage.from(CONVERSATIONS_BUCKET).list(prefix, {
    limit: 1000,
    sortBy: { column: 'created_at', order: 'desc' },
  });

  if (error) {
    throw new Error(`Failed to list storage prefix ${prefix}: ${error.message}`);
  }

  for (const obj of data || []) {
    if (!obj?.name) continue;
    // list() returns names within the prefix; reconstruct full path
    const full = `${prefix}/${obj.name}`;
    // Filter obvious non-audio
    const ext = path.extname(obj.name).toLowerCase();
    if (!['.mp3', '.wav', '.m4a', '.aac', '.ogg'].includes(ext)) continue;
    out.push(full);
  }

  return out;
}

function getConversationPublicUrl(supabase: any, objectPath: string): string {
  const { data } = supabase.storage.from(CONVERSATIONS_BUCKET).getPublicUrl(objectPath);
  return data?.publicUrl || '';
}

// --------------------------------------------
// LangGraph: per-recording pipeline
// --------------------------------------------

type SpeakerNameGuess = { speaker_label: string; name: string | null; confidence: number };

type MergedTurn = {
  speaker_label: string;
  start_ms: number;
  end_ms: number;
  text: string;
  words: Array<{ text: string; start_ms: number; end_ms: number; confidence?: number }>;
};

type AssignedTurn = MergedTurn & { speaker_name: string; question_index: number; narrative_index: number };

type FilteredTurn = AssignedTurn & {
  standalone_score?: number;
  direct_answer_score?: number;
  keep_reason?: string;
};

type TurnLite = { speaker_label: string; start_ms: number; end_ms: number; text: string };

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

  // Ensure word order within each turn
  for (const t of merged) {
    t.words.sort((a, b) => a.start_ms - b.start_ms);

    // 🔧 FIX: Use word-level timestamps as source of truth
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

function toTurnLite(turns: MergedTurn[]): TurnLite[] {
  return turns.map((t) => ({
    speaker_label: t.speaker_label,
    start_ms: t.start_ms,
    end_ms: t.end_ms,
    text: t.text,
  }));
}

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

  const parsed = await openaiJsonSchema<{ guesses: SpeakerNameGuess[] }>({
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
  for (const label of labels) {
    const g = parsed.guesses.find((x) => x.speaker_label === label);
    const name = g?.name && typeof g.name === 'string' ? g.name.trim() : '';
    const confidence = typeof g?.confidence === 'number' ? g.confidence : 0;

    // Gate: require moderately high confidence
    if (name && confidence >= 0.7) {
      out[label] = { name, confidence };
    } else {
      out[label] = { name: `Speaker ${label}`, confidence };
    }
  }

  return out;
}

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
    '{"results":[{"idx":number,"best_index":number,"reason":"string"}] }',
    '',
    'Rules:',
    '- idx refers to the item index (0..N-1) within this batch.',
    '- best_index must be a valid template question index.',
    '',
    'Template questions (index: text):',
    ...templateQuestions.map((q, idx) => `${idx}: ${q}`),
    '',
    'Turns:',
    ...turns.map((t, i) => `#${i} (global_turn=${offset + i}) [Speaker ${t.speaker_label}]: ${t.text}`),
  ].join('\n');

  const parsed = await openaiJsonSchema<{
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

async function filterTurnsForUpload({
  apiKey,
  model,
  templateQuestions,
  assignedTurns,
}: {
  apiKey: string;
  model: string;
  templateQuestions: string[];
  assignedTurns: AssignedTurn[];
}): Promise<FilteredTurn[]> {
  if (assignedTurns.length === 0) return [];

  const items = assignedTurns.map((t, idx) => {
    const q = templateQuestions[t.question_index] || templateQuestions[0] || '';
    return {
      idx,
      speaker: t.speaker_name,
      question: q,
      text: t.text,
    };
  });

  const prompt = [
    'You are filtering diarized speaker turns to decide which ones should become RESPONSE nodes in a Q/A anthology graph.',
    '',
    'For EACH item, decide whether to KEEP it based on BOTH criteria:',
    '1) The turn is fairly understandable on its own (standalone).',
    '2) The turn directly responds to the given question (not facilitation, chatter, meta-comments, or off-topic).',
    '',
    'Return JSON ONLY with schema:',
    '{"results":[{"idx":number,"keep":boolean,"standalone_score":0-1,"direct_answer_score":0-1,"reason":"string"}] }',
    '',
    'Guidelines:',
    '- keep=false for: short acknowledgements, filler, facilitation prompts, cross-talk, repetitions, or unclear fragments.',
    '- keep=false if it is not a direct answer to the question even if coherent.',
    '- If uncertain, keep=false.',
    '',
    'Items:',
    ...items.map(
      (it) =>
        `#${it.idx}\nQuestion: ${it.question}\nSpeaker: ${it.speaker}\nTurn: ${it.text}`
    ),
  ].join('\n');

  const parsed = await openaiJsonSchema<{
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
  });

  const byIdx = new Map<number, (typeof parsed.results)[number]>();
  for (const r of parsed.results || []) {
    if (typeof r?.idx === 'number') byIdx.set(r.idx, r);
  }

  // Thresholds disabled - keep all turns regardless of scores
  // const MIN_STANDALONE = 0.65;
  // const MIN_DIRECT = 0.7;

  const out: FilteredTurn[] = [];
  for (let idx = 0; idx < assignedTurns.length; idx++) {
    const t = assignedTurns[idx];
    const r = byIdx.get(idx);
    const standalone = typeof r?.standalone_score === 'number' ? r.standalone_score : 0;
    const direct = typeof r?.direct_answer_score === 'number' ? r.direct_answer_score : 0;
    // Keep all turns - thresholds disabled for now
    // const keep = Boolean(r?.keep) && standalone >= MIN_STANDALONE && direct >= MIN_DIRECT;
    const keep = true;
    if (!keep) continue;

    out.push({
      ...t,
      standalone_score: standalone,
      direct_answer_score: direct,
      keep_reason: typeof r?.reason === 'string' ? r.reason : undefined,
    });
  }

  return out;
}

/**
 * Calculate cosine similarity between two embedding vectors
 */
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

/**
 * Assign narratives to turns using embedding similarity
 * Returns an array of narrative indices (one per turn)
 *
 * @param turnEmbeddings - Embeddings for each turn text
 * @param narrativeEmbeddings - Embeddings for each narrative (including "Misc" as last)
 * @param similarityThreshold - Minimum similarity to assign (default 0.4)
 * @returns Array of narrative indices matching turns
 */
async function assignNarrativesToTurnsBatch({
  turnEmbeddings,
  narrativeEmbeddings,
  similarityThreshold = 0.4,
}: {
  turnEmbeddings: number[][];
  narrativeEmbeddings: number[][];
  similarityThreshold?: number;
}): Promise<number[]> {
  if (turnEmbeddings.length === 0) return [];
  if (narrativeEmbeddings.length === 0) {
    throw new Error('No narrative embeddings provided');
  }

  const miscIndex = narrativeEmbeddings.length - 1; // "Misc" is always last
  const narrativeIndices: number[] = [];

  for (const turnEmbedding of turnEmbeddings) {
    let bestSimilarity = -1;
    let bestNarrativeIdx = miscIndex; // Default to "Misc"

    // Compare turn embedding to all narrative embeddings (except "Misc")
    for (let narrativeIdx = 0; narrativeIdx < narrativeEmbeddings.length - 1; narrativeIdx++) {
      const similarity = cosineSimilarity(turnEmbedding, narrativeEmbeddings[narrativeIdx]);

      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestNarrativeIdx = narrativeIdx;
      }
    }

    // If best similarity is below threshold, assign to "Misc"
    if (bestSimilarity < similarityThreshold) {
      bestNarrativeIdx = miscIndex;
    }

    narrativeIndices.push(bestNarrativeIdx);
  }

  return narrativeIndices;
}

async function ensureConversationSkeleton({
  supabase,
  anthologyId,
  anthologySlug,
  objectPath,
  audioUrl,
  transcript,
  templateQuestions,
  templateNarratives,
  speakerNames,
  paletteIndex,
  openaiKey,
}: {
  supabase: any;
  anthologyId: string;
  anthologySlug: string;
  objectPath: string;
  audioUrl: string;
  transcript: AssemblyTranscript;
  templateQuestions: string[];
  templateNarratives: string[];
  speakerNames: string[];
  paletteIndex: number;
  openaiKey?: string;
}): Promise<{ conversationId: string; recordingId: string; questionDbIds: string[]; narrativeDbIds: string[]; speakerDbIds: Record<string, string> }> {
  const fileName = path.basename(objectPath);

  const durationMs = (() => {
    const dur = transcript.audio_duration;
    if (typeof dur === 'number' && dur > 0) return Math.round(dur * 1000);
    const lastWordEnd =
      Array.isArray(transcript.words) && transcript.words.length > 0
        ? Math.max(...transcript.words.map((w) => w.end || 0))
        : 0;
    return lastWordEnd > 0 ? lastWordEnd : 1;
  })();

  // Recording
  const { data: recording, error: recErr } = await supabase
    .from('anthology_recordings')
    .insert({
      anthology_id: anthologyId,
      file_path: audioUrl,
      file_name: fileName,
      mime_type: 'audio/mpeg',
      duration_ms: durationMs,
      metadata: { source: 'sensemaking', bucket: CONVERSATIONS_BUCKET, object_path: objectPath },
    })
    .select('id')
    .single();
  if (recErr) throw recErr;

  const convColor = SPEAKER_PALETTE[paletteIndex % SPEAKER_PALETTE.length];
  const title = fileName.replace(path.extname(fileName), '');

  // Conversation
  const { data: conversation, error: convErr } = await supabase
    .from('anthology_conversations')
    .insert({
      anthology_id: anthologyId,
      title,
      color: convColor,
      participants: speakerNames,
      metadata: { source: 'sensemaking', anthology_slug: anthologySlug, object_path: objectPath },
    })
    .select('id')
    .single();
  if (convErr) throw convErr;

  // Link
  const { error: linkErr } = await supabase.from('anthology_conversation_recordings').insert({
    conversation_id: conversation.id,
    recording_id: recording.id,
    is_primary: true,
    recording_order: 1,
  });
  if (linkErr) throw linkErr;

  // Speakers
  const speakerDbIds: Record<string, string> = {};
  for (const [idx, name] of speakerNames.entries()) {
    const base = SPEAKER_PALETTE[idx % SPEAKER_PALETTE.length];
    const colors = speakerColors(base);
    const { data: s, error: sErr } = await supabase
      .from('anthology_speakers')
      .insert({
        anthology_id: anthologyId,
        conversation_id: conversation.id,
        name,
        ...colors,
        metadata: { source: 'sensemaking' },
      })
      .select('id')
      .single();
    if (sErr) throw sErr;
    speakerDbIds[name] = s.id;
  }

  // Questions
  const questionDbIds: string[] = [];
  for (const q of templateQuestions) {
    const { data: qRow, error: qErr } = await supabase
      .from('anthology_questions')
      .insert({
        anthology_id: anthologyId,
        conversation_id: conversation.id,
        question_text: q,
        metadata: { source: 'sensemaking' },
      })
      .select('id')
      .single();
    if (qErr) throw qErr;
    questionDbIds.push(qRow.id);
  }

  // Narratives
  console.log('[sensemaking.skeleton] Creating narratives:', {
    anthologyId,
    conversationId: conversation.id,
    narrativeCount: templateNarratives.length,
    narratives: templateNarratives,
  });

  const narrativeDbIds: string[] = [];
  for (const n of templateNarratives) {
    console.log('[sensemaking.skeleton] Inserting narrative:', {
      narrative: n,
      insertData: {
        anthology_id: anthologyId,
        conversation_id: conversation.id,
        narrative_text: n,
        metadata: { source: 'sensemaking' },
      }
    });
    const { data: nRow, error: nErr } = await supabase
      .from('anthology_narratives')
      .insert({
        anthology_id: anthologyId,
        conversation_id: conversation.id,
        narrative_text: n,
        // metadata: { source: 'sensemaking' },  // TODO: Add metadata column to table first
      })
      .select('id')
      .single();

    if (nErr) {
      console.error('[sensemaking.skeleton] Narrative insertion failed:', {
        error: nErr,
        message: nErr.message,
        details: nErr.details,
        hint: nErr.hint,
        code: nErr.code,
      });
      throw nErr;
    }

    console.log('[sensemaking.skeleton] Narrative inserted successfully:', { narrativeId: nRow.id, narrative: n });
    narrativeDbIds.push(nRow.id);
  }

  console.log('[sensemaking.skeleton] All narratives created:', {
    narrativeDbIds,
    count: narrativeDbIds.length,
  });

  // Always create a "Misc" narrative for low-confidence matches
  console.log('[sensemaking.skeleton] Creating "Misc" narrative for low-confidence matches');
  const { data: miscRow, error: miscErr } = await supabase
    .from('anthology_narratives')
    .insert({
      anthology_id: anthologyId,
      conversation_id: conversation.id,
      narrative_text: 'Misc',
    })
    .select('id')
    .single();

  if (miscErr) {
    console.error('[sensemaking.skeleton] Misc narrative insertion failed:', {
      error: miscErr,
      message: miscErr.message,
      details: miscErr.details,
    });
    throw miscErr;
  }

  console.log('[sensemaking.skeleton] Misc narrative created:', { miscId: miscRow.id });
  narrativeDbIds.push(miscRow.id);

  console.log('[sensemaking.skeleton] All narratives including Misc:', {
    narrativeDbIds,
    totalCount: narrativeDbIds.length,
  });

  // Generate embeddings for all narratives (including "Misc")
  if (openaiKey && narrativeDbIds.length > 0) {
    try {
      const allNarrativeTexts = [...templateNarratives, 'Misc'];

      console.log('[sensemaking.skeleton.embeddings] Generating embeddings for narratives:', {
        count: allNarrativeTexts.length,
        narratives: allNarrativeTexts,
      });

      const narrativeEmbeddings = await generateEmbeddings({
        apiKey: openaiKey,
        texts: allNarrativeTexts,
      });

      console.log('[sensemaking.skeleton.embeddings] Embeddings generated:', {
        embeddingCount: narrativeEmbeddings.length,
      });

      // Update each narrative with its embedding
      for (let idx = 0; idx < narrativeDbIds.length; idx++) {
        const narrativeId = narrativeDbIds[idx];
        const embedding = narrativeEmbeddings[idx];

        if (embedding && embedding.length > 0) {
          // Format embedding as a PostgreSQL vector string
          const vectorStr = `[${embedding.join(',')}]`;

          const { error: updateErr } = await supabase
            .from('anthology_narratives')
            .update({ embedding: vectorStr })
            .eq('id', narrativeId);

          if (updateErr) {
            console.warn('[sensemaking.skeleton.embeddings] Failed to update narrative embedding:', {
              narrativeId,
              error: updateErr.message,
            });
          }
        }
      }

      console.log('[sensemaking.skeleton.embeddings] All narrative embeddings stored');
    } catch (embErr) {
      // Log but don't fail if embeddings fail
      console.warn('[sensemaking.skeleton.embeddings] Error generating narrative embeddings:', {
        error: embErr instanceof Error ? embErr.message : String(embErr),
      });
    }
  }

  return { conversationId: conversation.id, recordingId: recording.id, questionDbIds, narrativeDbIds, speakerDbIds };
}

async function upsertResponseBatch({
  supabase,
  anthologyId,
  conversationId,
  recordingId,
  questionDbIds,
  narrativeDbIds,
  speakerDbIds,
  turns,
  turnNumberOffset,
  openaiKey,
}: {
  supabase: any;
  anthologyId: string;
  conversationId: string;
  recordingId: string;
  questionDbIds: string[];
  narrativeDbIds: string[];
  speakerDbIds: Record<string, string>;
  turns: FilteredTurn[];
  turnNumberOffset: number;
  openaiKey?: string;
}) {
  if (turns.length === 0) return;

  const debugEnabled =
    process.env.SENSEMAKING_DEBUG === '1' ||
    process.env.SENSEMAKING_DEBUG === 'true' ||
    process.env.NODE_ENV !== 'production';

  const rows = turns.map((t, idx) => {
    const turnNumber = turnNumberOffset + idx + 1;
    const questionId = questionDbIds[t.question_index] || questionDbIds[0];
    const narrativeId = narrativeDbIds[t.narrative_index] || narrativeDbIds[narrativeDbIds.length - 1]; // Default to "Misc" (last)
    const speakerId = speakerDbIds[t.speaker_name] || null;
    // Use a deterministic legacy_id so retries are idempotent without requiring
    // a unique constraint on (conversation_id, turn_number).
    const legacyId = `sensemaking:${conversationId}:${turnNumber}`;

    // Only log first and last turn in batch
    if (idx === 0 || idx === turns.length - 1) {
      console.log(`[upsert] Turn ${turnNumber}: ${t.start_ms}ms-${t.end_ms}ms (${Math.round((t.end_ms - t.start_ms) / 1000)}s) "${t.text.slice(0, 40)}..."`);
    }

    return {
      anthology_id: anthologyId,
      legacy_id: legacyId,
      conversation_id: conversationId,
      responds_to_question_id: questionId,
      responds_to_narrative_id: narrativeId,
      speaker_id: speakerId,
      speaker_name: t.speaker_name,
      speaker_text: t.text,
      recording_id: recordingId,
      audio_start_ms: t.start_ms,
      audio_end_ms: t.end_ms,
      turn_number: turnNumber,
      medium: 'audio',  // Sensemaking responses are always from audio
      synchronicity: 'sync',  // Sensemaking responses are synchronous (batch uploaded)
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

  const { error } = await supabase
    .from('anthology_responses')
    .upsert(rows, { onConflict: 'anthology_id,legacy_id' });

  if (error) throw error;

  // Generate embeddings for the response texts if OpenAI key is provided
  if (openaiKey && turns.length > 0) {
    try {
      const texts = turns.map((t) => t.text);

      if (debugEnabled) {
        // eslint-disable-next-line no-console
        console.log('[sensemaking.embeddings.start]', {
          conversationId,
          turnCount: texts.length,
        });
      }

      const embeddings = await generateEmbeddings({
        apiKey: openaiKey,
        texts,
      });

      if (debugEnabled) {
        // eslint-disable-next-line no-console
        console.log('[sensemaking.embeddings.generated]', {
          conversationId,
          embeddingCount: embeddings.length,
        });
      }

      // Update each response with its embedding
      // We need to match by legacy_id since we just upserted
      for (let idx = 0; idx < turns.length; idx++) {
        const turnNumber = turnNumberOffset + idx + 1;
        const legacyId = `sensemaking:${conversationId}:${turnNumber}`;
        const embedding = embeddings[idx];

        if (embedding && embedding.length > 0) {
          // Format embedding as a PostgreSQL vector string
          const vectorStr = `[${embedding.join(',')}]`;

          const { error: updateErr } = await supabase
            .from('anthology_responses')
            .update({ embedding: vectorStr })
            .eq('anthology_id', anthologyId)
            .eq('legacy_id', legacyId);

          if (updateErr) {
            console.warn('[sensemaking.embeddings.update_error]', {
              legacyId,
              error: updateErr.message,
            });
          }
        }
      }

      if (debugEnabled) {
        // eslint-disable-next-line no-console
        console.log('[sensemaking.embeddings.stored]', {
          conversationId,
          storedCount: embeddings.filter((e) => e && e.length > 0).length,
        });
      }
    } catch (embErr) {
      // Log but don't fail the entire batch if embeddings fail
      console.warn('[sensemaking.embeddings.error]', {
        conversationId,
        error: embErr instanceof Error ? embErr.message : String(embErr),
      });
    }
  }
}

/**
 * Set chronological_turn_number for all sensemaking responses in a conversation
 * based on audio_start_ms temporal order.
 * Only affects responses with metadata.source = 'sensemaking'.
 */
async function setChronologicalTurnNumbers({
  supabase,
  conversationId,
}: {
  supabase: any;
  conversationId: string;
}) {
  // Get all sensemaking responses for this conversation, ordered by audio_start_ms
  const { data: responses, error: fetchErr } = await supabase
    .from('anthology_responses')
    .select('id, audio_start_ms, metadata')
    .eq('conversation_id', conversationId)
    .order('audio_start_ms', { ascending: true });

  if (fetchErr) {
    console.warn('[sensemaking.chronological] Failed to fetch responses:', fetchErr);
    return;
  }

  if (!responses || responses.length === 0) {
    return;
  }

  // Filter to only sensemaking responses
  const sensemakingResponses = responses.filter((r: any) => {
    const metadata = r.metadata || {};
    return metadata.source === 'sensemaking';
  });

  if (sensemakingResponses.length === 0) {
    return;
  }

  // Update each response with its chronological position
  // Use individual updates instead of upsert since upsert requires all non-null columns
  let updateCount = 0;
  let updateError: any = null;

  for (let index = 0; index < sensemakingResponses.length; index++) {
    const r = sensemakingResponses[index];
    const { error } = await supabase
      .from('anthology_responses')
      .update({ chronological_turn_number: index + 1 })
      .eq('id', r.id);

    if (error) {
      updateError = error;
      console.warn('[sensemaking.chronological] Failed to update response:', r.id, error);
    } else {
      updateCount++;
    }
  }

  if (updateError) {
    console.warn('[sensemaking.chronological] Some updates failed:', updateError);
  } else {
    console.log(`[sensemaking.chronological] Set chronological_turn_number for ${updateCount} responses in conversation ${conversationId}`);
  }
}

// --------------------------------------------
// Persistence (Supabase)
// --------------------------------------------

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

function hexToRgba(hex: string, alpha: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(0, 0, 0, ${alpha})`;
  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function darkenColor(hex: string, percent: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return hex;
  let r = parseInt(result[1], 16);
  let g = parseInt(result[2], 16);
  let b = parseInt(result[3], 16);
  r = Math.round(r * (1 - percent));
  g = Math.round(g * (1 - percent));
  b = Math.round(b * (1 - percent));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function speakerColors(base: string) {
  return {
    circle_color: base,
    faded_circle_color: hexToRgba(base, 0.35),
    quote_rectangle_color: hexToRgba(base, 0.15),
    faded_quote_rectangle_color: hexToRgba(base, 0.08),
    quote_text_color: darkenColor(base, 0.4),
    faded_quote_text_color: darkenColor(base, 0.4),
  };
}

// --------------------------------------------
// Public API: start/status/tick
// --------------------------------------------

export async function startSensemaking(req: StartRequest): Promise<StartResponse> {
  const supabase = getSupabaseServiceClient();

  console.log('[sensemaking.start] Request received:', {
    anthologySlug: req.anthologySlug,
    anthologyTitle: req.anthologyTitle,
    templateQuestionsCount: req.templateQuestions?.length || 0,
    templateNarrativesCount: req.templateNarratives?.length || 0,
    templateNarratives: req.templateNarratives,
    uploadedFilePathsCount: req.uploadedFilePaths?.length || 0,
  });

  // Create anthology (private until done)
  const insertAnthology = async (slug: string) => {
    return supabase
      .from('anthology_anthologies')
      .insert({
        slug,
        title: req.anthologyTitle,
        is_public: false,
        metadata: { source: 'sensemaking', created_at: nowIso() },
      })
      .select('id, slug')
      .single();
  };

  // Ensure unique slug (if collision, suffix timestamp)
  let anthologySlug = req.anthologySlug;
  let anthologyId: string;

  {
    const { data, error } = await insertAnthology(anthologySlug);
    if (!error && data?.id) {
      anthologyId = data.id;
      anthologySlug = data.slug;
    } else {
      const candidate = `${anthologySlug}-${Date.now()}`;
      const { data: d2, error: e2 } = await insertAnthology(candidate);
      if (e2 || !d2?.id) throw e2 || new Error('Failed to create anthology');
      anthologyId = d2.id;
      anthologySlug = d2.slug;
    }
  }

  // File paths
  const uniqueUploads = Array.from(new Set(req.uploadedFilePaths)).filter((s) => typeof s === 'string' && s.length > 0);
  let filePaths = uniqueUploads;

  if (req.includePreviousUploads) {
    const folderPaths = await listConversationFolderObjectPaths(supabase, anthologySlug);
    const set = new Set([...filePaths, ...folderPaths]);
    filePaths = Array.from(set);
  }

  const progress = ensureProgress({}, filePaths);

  const { data: job, error: jobErr } = await supabase
    .from('anthology_sensemaking_jobs')
    .insert({
      anthology_id: anthologyId,
      anthology_slug: anthologySlug,
      anthology_title: req.anthologyTitle,
      template_questions: req.templateQuestions,
      template_narratives: req.templateNarratives,
      include_previous_uploads: req.includePreviousUploads,
      file_paths: filePaths,
      status: 'queued',
      progress,
    })
    .select('id')
    .single();

  if (jobErr) throw jobErr;

  return { jobId: job.id, anthologySlug, anthologyId };
}

export async function getSensemakingStatus(jobId: string): Promise<StatusResponse> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from('anthology_sensemaking_jobs')
    .select('*')
    .eq('id', jobId)
    .single();
  if (error) throw error;

  return {
    jobId: data.id,
    status: data.status,
    anthologySlug: data.anthology_slug,
    anthologyId: data.anthology_id,
    progress: (data.progress || {}) as JobProgress,
    error: data.error || undefined,
  };
}

export async function tickSensemaking({ jobId, timeBudgetMs = 15000 }: { jobId: string; timeBudgetMs?: number }): Promise<TickResponse> {
  const startAt = Date.now();
  const supabase = getSupabaseServiceClient();

  const debugEnabled =
    process.env.SENSEMAKING_DEBUG === '1' ||
    process.env.SENSEMAKING_DEBUG === 'true' ||
    process.env.NODE_ENV !== 'production';
  const log = (event: string, data?: Record<string, unknown>) => {
    if (!debugEnabled) return;
    // eslint-disable-next-line no-console
    console.log('[sensemaking]', {
      event,
      jobId,
      t: nowIso(),
      ...(data || null),
    });
  };

  const saveJob = async ({ progress, status, error }: { progress: JobProgress; status?: SensemakingJobStatus; error?: string }) => {
    const patch: any = { progress };
    if (status) patch.status = status;
    if (typeof error === 'string') patch.error = error;

    const { error: saveErr } = await supabase.from('anthology_sensemaking_jobs').update(patch).eq('id', jobId);
    if (saveErr) throw saveErr;
  };

  const shouldHeartbeatUpdate = (file: any) => {
    const ts = typeof file?.updated_at === 'string' ? Date.parse(file.updated_at) : NaN;
    if (!Number.isFinite(ts)) return true;
    // Limit DB writes during long transcriptions (update at most every 15s per file)
    return Date.now() - ts > 15_000;
  };

  const { data: job, error: jobErr } = await supabase
    .from('anthology_sensemaking_jobs')
    .select('*')
    .eq('id', jobId)
    .single();
  if (jobErr) throw jobErr;

  log('tick.loaded_job', {
    status: job.status,
    anthologyId: job.anthology_id,
    fileCount: Array.isArray(job.file_paths) ? job.file_paths.length : null,
    timeBudgetMs,
  });

  const status = job.status as SensemakingJobStatus;
  if (status === 'done' || status === 'error') {
    return {
      jobId: job.id,
      status,
      anthologySlug: job.anthology_slug,
      anthologyId: job.anthology_id,
      progress: (job.progress || {}) as JobProgress,
      error: job.error || undefined,
      didWork: false,
    };
  }

  const assemblyKey = requireEnv('ASSEMBLYAI_API_KEY');
  const openaiKey = requireEnv('OPENAI_API_KEY');
  const openaiModel = process.env.OPENAI_SENSEMAKING_MODEL || 'gpt-5-mini-2025-08-07';

  const filePaths: string[] = Array.isArray(job.file_paths) ? job.file_paths : [];
  const templateQuestions: string[] = Array.isArray(job.template_questions) ? job.template_questions : [];
  const templateNarratives: string[] = Array.isArray(job.template_narratives) ? job.template_narratives : [];
  let progress = ensureProgress(job.progress, filePaths);

  // Move job to running
  if (job.status !== 'running') {
    const { error: upErr } = await supabase
      .from('anthology_sensemaking_jobs')
      .update({ status: 'running' })
      .eq('id', jobId);
    if (upErr) throw upErr;
  }

  const files = progress.files || {};
  const inFlight = Object.entries(files).filter(([, f]) => f.assembly_id && ['transcription_queued', 'transcribing'].includes(f.step));

  let didWork = false;

  // Start new transcriptions up to concurrency=2
  const concurrency = 2;
  const slots = Math.max(0, concurrency - inFlight.length);
  if (slots > 0) {
    const toStart = Object.entries(files)
      .filter(([, f]) => f.step === 'pending')
      .slice(0, slots)
      .map(([fp]) => fp);

    for (const fp of toStart) {
      log('transcription.start', { file: fp });
      const audioUrl = getConversationPublicUrl(supabase, fp);
      if (!audioUrl) {
        setFileStep(progress, fp, 'error', 'Missing public URL for storage object');
        continue;
      }
      setFileStep(progress, fp, 'transcription_queued', 'Starting AssemblyAI transcription');
      didWork = true;

      try {
        const { id } = await assemblyStartTranscription({ apiKey: assemblyKey, audioUrl });
        log('transcription.started', { file: fp, assemblyId: id });
        progress.files![fp] = {
          ...progress.files![fp],
          step: 'transcribing',
          assembly_id: id,
          message: 'Transcribing (AssemblyAI)',
          updated_at: nowIso(),
        };
      } catch (e) {
        log('transcription.start_error', { file: fp, error: e instanceof Error ? e.message : String(e) });
        setFileStep(progress, fp, 'error', e instanceof Error ? e.message : 'Failed to start transcription');
      }
    }
  }

  // Poll in-flight transcripts; process at most one completed transcript per tick (time budget)
  const pollables = Object.entries(progress.files || {})
    .filter(([, f]) => f.assembly_id && ['transcribing', 'transcription_queued'].includes(f.step))
    .slice(0, 10);

  for (const [fp, f] of pollables) {
    if (Date.now() - startAt > timeBudgetMs) break;
    if (!f.assembly_id) continue;

    try {
      const data = await assemblyPollTranscript({ apiKey: assemblyKey, transcriptId: f.assembly_id });

      log('transcription.poll', {
        file: fp,
        assemblyId: f.assembly_id,
        status: data.status,
        hasUtterances: Array.isArray((data as any).utterances),
        utteranceCount: Array.isArray((data as any).utterances) ? (data as any).utterances.length : 0,
      });

      // Debug heartbeat: surface AssemblyAI status in the job progress so the UI updates.
      if ((data.status === 'queued' || data.status === 'processing') && shouldHeartbeatUpdate(f)) {
        didWork = true;
        const startedAt = (progress.files as any)?.[fp]?.started_at;
        const elapsedSec = (() => {
          const ts = typeof startedAt === 'string' ? Date.parse(startedAt) : NaN;
          if (!Number.isFinite(ts)) return null;
          return Math.floor((Date.now() - ts) / 1000);
        })();

        progress.files![fp] = {
          ...progress.files![fp],
          step: 'transcribing',
          message: `Transcribing (AssemblyAI: ${data.status}) — id=${f.assembly_id}${typeof elapsedSec === 'number' ? ` — elapsed=${elapsedSec}s` : ''
            }`,
          updated_at: nowIso(),
        };
      }

      if (data.status === 'completed') {
        didWork = true;
        log('transcription.completed', { file: fp, assemblyId: f.assembly_id });
        // Initialize time-sliced pipeline state for this file.
        // After this, subsequent ticks will process chunks without re-fetching the transcript.
        setFileStep(progress, fp, 'transcript_ready', 'Transcript ready; preparing turns');

        const utterances = (data as any).utterances || [];
        const mergedTurnsFull = cleanAndMergeTurns(utterances);

        // 🔍 TIMESTAMP VERIFICATION (first 3 turns)
        console.log('🔍 ========== TIMESTAMP VERIFICATION START ==========');
        for (let i = 0; i < Math.min(3, mergedTurnsFull.length); i++) {
          const turn = mergedTurnsFull[i];
          const firstWord = turn.words[0];
          const lastWord = turn.words[turn.words.length - 1];
          const startDrift = firstWord ? turn.start_ms - firstWord.start_ms : null;
          const endDrift = lastWord ? turn.end_ms - lastWord.end_ms : null;

          console.log(`Turn ${i + 1}: ${startDrift === 0 ? '✅' : '⚠️'} start_drift=${startDrift}ms, end_drift=${endDrift}ms | "${turn.text.slice(0, 40)}..."`);
        }
        console.log('🔍 ========== TIMESTAMP VERIFICATION END ==========');

        const mergedLite = toTurnLite(mergedTurnsFull);

        setFileStep(progress, fp, 'speaker_naming', 'Inferring speaker names');
        log('speaker_naming.start', { file: fp, model: openaiModel });
        const speakerMap = await guessSpeakerNames({ apiKey: openaiKey, model: openaiModel, mergedTurns: mergedTurnsFull });
        log('speaker_naming.done', { file: fp, speakers: Object.keys(speakerMap || {}).length });

        // Speaker names list
        const speakerNames = Array.from(
          new Set(
            mergedTurnsFull.map((t) => speakerMap[t.speaker_label]?.name || `Speaker ${t.speaker_label}`)
          )
        );

        const audioUrl = getConversationPublicUrl(supabase, fp);
        if (!audioUrl) {
          setFileStep(progress, fp, 'error', 'Missing public URL for storage object');
          break;
        }

        setFileStep(progress, fp, 'uploading_nodes', 'Creating conversation/questions/narratives/speakers');
        log('skeleton.create.start', { file: fp, templateNarrativesCount: templateNarratives.length, templateNarratives });
        const skeleton = await ensureConversationSkeleton({
          supabase,
          anthologyId: job.anthology_id,
          anthologySlug: job.anthology_slug,
          objectPath: fp,
          audioUrl,
          transcript: data,
          templateQuestions,
          templateNarratives,
          speakerNames,
          paletteIndex: filePaths.indexOf(fp) >= 0 ? filePaths.indexOf(fp) : 0,
          openaiKey,
        });
        log('skeleton.create.done', {
          file: fp,
          conversationId: skeleton.conversationId,
          recordingId: skeleton.recordingId,
          questions: skeleton.questionDbIds.length,
          narratives: skeleton.narrativeDbIds.length,
        });

        // Smaller batches reduce token pressure + are less likely to hit serverless timeouts.
        // (Also helps keep each OpenAI call under typical serverless limits.)
        const batchSize = 5;
        const totalChunks = Math.max(1, Math.ceil(mergedLite.length / batchSize));

        progress.files![fp] = {
          ...progress.files![fp],
          step: 'turn_filtering',
          message: `Prepared ${mergedLite.length} turns; starting chunked processing (0/${totalChunks} chunks)`,
          updated_at: nowIso(),
          conversation_id: skeleton.conversationId,
          recording_id: skeleton.recordingId,
          cursor: 0,
          total_turns: mergedLite.length,
          batch_size: batchSize,
          merged_turns: mergedLite,
          speaker_map: speakerMap,
          question_db_ids: skeleton.questionDbIds,
          narrative_db_ids: skeleton.narrativeDbIds,
          speaker_db_ids: skeleton.speakerDbIds,
        };

        break; // only initialize one completion per tick
      }

      if (data.status === 'error') {
        didWork = true;
        setFileStep(progress, fp, 'error', data.error || 'AssemblyAI transcription error');
      }
    } catch (e) {
      didWork = true;
      setFileStep(progress, fp, 'error', e instanceof Error ? e.message : 'Failed to poll transcription');
    }
  }

  // Time-sliced post-processing: process at most ONE file chunk per tick.
  const processables = Object.entries(progress.files || {}).filter(([, f]) => {
    return (
      f.step === 'turn_filtering' &&
      Array.isArray(f.merged_turns) &&
      typeof f.cursor === 'number' &&
      typeof f.total_turns === 'number' &&
      f.cursor < f.total_turns
    );
  });

  if (processables.length > 0 && Date.now() - startAt <= timeBudgetMs) {
    const [fp, f] = processables[0];

    try {
      const mergedTurns: TurnLite[] = f.merged_turns as any;
      const cursor = typeof f.cursor === 'number' ? f.cursor : 0;
      const totalTurns = typeof f.total_turns === 'number' ? f.total_turns : mergedTurns.length;

      // Smaller batches are more reliable for serverless timeouts + token limits.
      const batchSize =
        typeof (f as any).batch_size === 'number' && (f as any).batch_size > 0 ? (f as any).batch_size : 5;
      const batch = mergedTurns.slice(cursor, cursor + batchSize);

      const chunkIndex = Math.floor(cursor / batchSize) + 1; // 1-based
      const totalChunks = Math.max(1, Math.ceil(totalTurns / batchSize));

      log('turn_filtering.chunk.start', {
        file: fp,
        cursor,
        batchSize,
        batchCount: batch.length,
        totalTurns,
        chunkIndex,
        totalChunks,
        model: openaiModel,
      });

      // Persist a heartbeat BEFORE calling OpenAI so that if the function times out,
      // the UI doesn't look permanently stuck at "(0/N chunks)".
      progress.files![fp] = {
        ...progress.files![fp],
        message: `Chunk ${chunkIndex}/${totalChunks} — routing + filtering ${batch.length} turns...`,
        updated_at: nowIso(),
      };
      await saveJob({ progress, status: 'running' });

      // Route turns to questions (batched)
      const questionIdxs = await assignQuestionsToTurnsBatch({
        apiKey: openaiKey,
        model: openaiModel,
        templateQuestions,
        turns: batch,
        offset: cursor,
      });

      log('turn_filtering.chunk.routed', {
        file: fp,
        cursor,
        batchCount: batch.length,
        uniqueQuestionCount: Array.from(new Set(questionIdxs)).length,
      });

      // Assign narratives to turns using embeddings
      const narrativeDbIds = Array.isArray(f.narrative_db_ids) ? (f.narrative_db_ids as string[]) : [];
      let narrativeIdxs: number[] = [];

      if (openaiKey && narrativeDbIds.length > 0) {
        try {
          // Fetch narrative embeddings from database
          const { data: narrativeRows, error: narrativeErr } = await supabase
            .from('anthology_narratives')
            .select('id, embedding')
            .in('id', narrativeDbIds)
            .order('id'); // Order by ID to match narrativeDbIds order

          if (narrativeErr) {
            console.warn('[turn_filtering.narratives] Error fetching narrative embeddings:', narrativeErr.message);
          } else if (narrativeRows && narrativeRows.length > 0) {
            // Parse narrative embeddings
            const narrativeEmbeddings: number[][] = narrativeDbIds.map((dbId) => {
              const row = narrativeRows.find((r: any) => r.id === dbId);
              if (!row?.embedding) return [];

              // Parse PostgreSQL vector string to number array
              const vectorStr = row.embedding as string;
              if (typeof vectorStr === 'string' && vectorStr.startsWith('[') && vectorStr.endsWith(']')) {
                return vectorStr
                  .slice(1, -1)
                  .split(',')
                  .map((s) => parseFloat(s));
              }
              return [];
            });

            // Generate embeddings for turn texts
            const turnTexts = batch.map((t) => t.text);
            const turnEmbeddings = await generateEmbeddings({
              apiKey: openaiKey,
              texts: turnTexts,
            });

            log('turn_filtering.chunk.narrative_assignment', {
              file: fp,
              cursor,
              turnCount: turnEmbeddings.length,
              narrativeCount: narrativeEmbeddings.length,
            });

            // Assign narratives based on embedding similarity
            narrativeIdxs = await assignNarrativesToTurnsBatch({
              turnEmbeddings,
              narrativeEmbeddings,
              similarityThreshold: 0.4,
            });

            log('turn_filtering.chunk.narratives_assigned', {
              file: fp,
              cursor,
              uniqueNarrativeCount: Array.from(new Set(narrativeIdxs)).length,
            });
          }
        } catch (narrativeErr) {
          console.warn('[turn_filtering.narratives] Error during narrative assignment:', narrativeErr instanceof Error ? narrativeErr.message : String(narrativeErr));
        }
      }

      // Default to "Misc" (last narrative) if assignment failed
      if (narrativeIdxs.length === 0) {
        const miscIndex = Math.max(0, narrativeDbIds.length - 1);
        narrativeIdxs = batch.map(() => miscIndex);
      }

      const speakerMap = (f.speaker_map || {}) as Record<string, { name: string; confidence: number }>;
      const assignedBatch: AssignedTurn[] = batch.map((t, i) => {
        const speaker_name = speakerMap[t.speaker_label]?.name || `Speaker ${t.speaker_label}`;
        return {
          speaker_label: t.speaker_label,
          start_ms: t.start_ms,
          end_ms: t.end_ms,
          text: t.text,
          words: [],
          speaker_name,
          question_index: questionIdxs[i] ?? 0,
          narrative_index: narrativeIdxs[i] ?? (narrativeDbIds.length - 1), // Default to "Misc"
        };
      });

      // Filter turns to only those that are standalone + direct answers
      const filtered = await filterTurnsForUpload({
        apiKey: openaiKey,
        model: openaiModel,
        templateQuestions,
        assignedTurns: assignedBatch,
      });

      log('turn_filtering.chunk.filtered', {
        file: fp,
        cursor,
        kept: filtered.length,
        totalInBatch: batch.length,
      });

      // Persist responses for this chunk (idempotent via upsert on anthology_id,legacy_id)
      const conversationId = String(f.conversation_id || '');
      const recordingId = String(f.recording_id || '');
      const questionDbIds = Array.isArray(f.question_db_ids) ? (f.question_db_ids as string[]) : [];
      const narrativeDbIds = Array.isArray(f.narrative_db_ids) ? (f.narrative_db_ids as string[]) : [];
      const speakerDbIds = (f.speaker_db_ids || {}) as Record<string, string>;

      if (conversationId && recordingId && questionDbIds.length > 0) {
        await upsertResponseBatch({
          supabase,
          anthologyId: job.anthology_id,
          conversationId,
          recordingId,
          questionDbIds,
          narrativeDbIds,
          speakerDbIds,
          turns: filtered,
          turnNumberOffset: cursor,
          openaiKey, // Pass OpenAI key for embedding generation
        });
      }

      log('turn_filtering.chunk.persisted', {
        file: fp,
        cursor,
        nextCursor: Math.min(totalTurns, cursor + batch.length),
        conversationId,
        recordingId,
      });

      const nextCursor = Math.min(totalTurns, cursor + batch.length);
      didWork = true;
      progress.files![fp] = {
        ...progress.files![fp],
        cursor: nextCursor,
        message: `Chunk ${chunkIndex}/${totalChunks} — processed turns ${nextCursor}/${totalTurns} (kept ${filtered.length}/${batch.length} in last chunk)`,
        updated_at: nowIso(),
      };

      if (nextCursor >= totalTurns) {
        // Set chronological turn numbers for all sensemaking responses in this conversation
        const conversationId = String(f.conversation_id || '');
        if (conversationId) {
          await setChronologicalTurnNumbers({ supabase, conversationId });
        }

        setFileStep(progress, fp, 'done', 'Completed');
        log('turn_filtering.done', { file: fp, totalTurns });
      }
    } catch (e) {
      didWork = true;
      const msg = e instanceof Error ? e.message : 'Turn filtering failed';

      log('turn_filtering.chunk.error', { file: fp, error: msg });

      // Treat OpenAI issues that are often transient as retryable.
      if (msg.startsWith('OpenAI request timed out') || msg.startsWith('OpenAI returned non-JSON output')) {
        progress.files![fp] = {
          ...progress.files![fp],
          message: `Chunk processing failed; will retry next tick. (${msg})`,
          updated_at: nowIso(),
        };
        await saveJob({ progress, status: 'running' });

        return {
          jobId: job.id,
          status: 'running',
          anthologySlug: job.anthology_slug,
          anthologyId: job.anthology_id,
          progress,
          didWork,
        };
      }

      setFileStep(progress, fp, 'error', msg);
      await saveJob({
        progress,
        status: 'error',
        error: `turn_filtering failed for ${fp}: ${msg}`,
      });

      return {
        jobId: job.id,
        status: 'error',
        anthologySlug: job.anthology_slug,
        anthologyId: job.anthology_id,
        progress,
        error: `turn_filtering failed for ${fp}: ${msg}`,
        didWork,
      };
    }
  }

  // Update overall
  progress = ensureProgress(progress, filePaths);
  const done = Object.values(progress.files || {}).filter((x) => x.step === 'done').length;
  const total = filePaths.length;

  const firstFileError = Object.entries(progress.files || {}).find(([, f]) => f.step === 'error');
  const finalStatus: SensemakingJobStatus = firstFileError ? 'error' : done === total ? 'done' : 'running';

  await saveJob({
    progress,
    status: finalStatus,
    error: firstFileError
      ? `${firstFileError[0]}: ${typeof (firstFileError[1] as any)?.message === 'string' ? (firstFileError[1] as any).message : 'error'}`
      : undefined,
  });

  // When done, publish anthology
  if (finalStatus === 'done') {
    await supabase.from('anthology_anthologies').update({ is_public: true }).eq('id', job.anthology_id);
  }

  return {
    jobId: job.id,
    status: finalStatus,
    anthologySlug: job.anthology_slug,
    anthologyId: job.anthology_id,
    progress,
    didWork,
  };
}

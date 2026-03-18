import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

import { startSensemaking, tickSensemaking, getSensemakingStatus } from './api/_lib/sensemaking';
import { assemblyStartTranscription, assemblyPollTranscript, assemblyUploadAudio } from './api/_lib/assemblyai';
import { getSupabase, getConversationsBucket } from './api/_lib/supabase';

type Json = Record<string, unknown>;

/** Read the full JSON body from a raw Node IncomingMessage. */
async function readJsonBody(req: any): Promise<Json | null> {
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve) => {
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve());
  });
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Json;
  } catch {
    return null;
  }
}

/** Write a JSON response on a raw Node ServerResponse. */
function sendJson(res: any, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

/**
 * Local dev-only implementation of the async transcribe endpoints.
 *
 * Registers three middleware routes (specific paths first):
 *   GET  /api/transcribe/status  — read-only status check
 *   POST /api/transcribe/tick    — poll AssemblyAI and save transcript
 *   POST /api/transcribe         — start transcription job
 */
function localTranscribeAsyncApiPlugin() {
  return {
    name: 'local-transcribe-async-api',
    configureServer(server: any) {
      // ── GET /api/transcribe/status ──
      server.middlewares.use('/api/transcribe/status', async (req: any, res: any) => {
        if (req.method !== 'GET') { sendJson(res, 405, { error: 'Method not allowed' }); return; }

        const url = new URL(req.url, 'http://localhost');
        const recordingId = url.searchParams.get('recordingId') || '';
        if (!recordingId) { sendJson(res, 400, { error: 'recordingId query param is required' }); return; }

        try {
          const sb = getSupabase();
          const { data: recording, error } = await sb
            .from('anthology_recordings')
            .select('id, metadata, duration_ms')
            .eq('id', recordingId)
            .single();

          if (error || !recording) { sendJson(res, 404, { error: 'Recording not found' }); return; }

          const md = (recording.metadata || {}) as Record<string, unknown>;
          sendJson(res, 200, {
            data: {
              recordingId: recording.id,
              status: md.transcription_status || null,
              assemblyId: md.assembly_id || null,
              transcriptPath: md.transcript_path || null,
              audioDurationMs: md.audio_duration_ms || null,
              error: md.transcription_error || null,
              startedAt: md.transcription_started_at || null,
              completedAt: md.transcription_completed_at || null,
            },
          });
        } catch (e) {
          sendJson(res, 500, { error: e instanceof Error ? e.message : 'Unknown error' });
        }
      });

      // ── POST /api/transcribe/tick ──
      server.middlewares.use('/api/transcribe/tick', async (req: any, res: any) => {
        if (req.method !== 'POST') { sendJson(res, 405, { error: 'Method not allowed' }); return; }

        const body = await readJsonBody(req);
        if (!body) { sendJson(res, 400, { error: 'Invalid JSON body' }); return; }

        const recordingId = (body as any).recordingId;
        if (!recordingId) { sendJson(res, 400, { error: 'recordingId is required' }); return; }

        const apiKey = process.env.ASSEMBLYAI_API_KEY || process.env.ASSEMBLY_API_KEY;
        if (!apiKey) { sendJson(res, 500, { error: 'Missing ASSEMBLYAI_API_KEY' }); return; }

        try {
          const sb = getSupabase();
          const { data: recording, error: recErr } = await sb
            .from('anthology_recordings')
            .select('id, metadata, duration_ms')
            .eq('id', recordingId)
            .single();

          if (recErr || !recording) { sendJson(res, 404, { error: 'Recording not found' }); return; }

          const md = (recording.metadata || {}) as Record<string, unknown>;
          const currentStatus = md.transcription_status as string | undefined;

          // Already done or errored — nothing to do
          if (currentStatus === 'completed' || currentStatus === 'error') {
            sendJson(res, 200, { data: { status: currentStatus, didWork: false } });
            return;
          }

          const assemblyId = md.assembly_id as string | undefined;
          if (!assemblyId) {
            sendJson(res, 400, { error: 'No assembly_id in metadata — start transcription first' });
            return;
          }

          const result = await assemblyPollTranscript({ apiKey, transcriptId: assemblyId });

          if (result.status === 'completed') {
            const transcriptJson = {
              text: result.text || '',
              words: result.words || [],
              utterances: result.utterances || [],
              audio_duration: result.audio_duration || 0,
              assembly_id: assemblyId,
              completed_at: new Date().toISOString(),
            };

            const transcriptPath = md.transcript_path as string;
            const bucket = (md.bucket as string) || getConversationsBucket();

            if (transcriptPath) {
              await sb.storage.from(bucket).upload(
                transcriptPath,
                JSON.stringify(transcriptJson, null, 2),
                { contentType: 'application/json', upsert: true },
              );
            }

            const audioDurationMs = Math.round((result.audio_duration || 0) * 1000);
            const now = new Date().toISOString();

            await sb
              .from('anthology_recordings')
              .update({
                duration_ms: audioDurationMs,
                metadata: {
                  ...md,
                  transcription_status: 'completed',
                  audio_duration_ms: audioDurationMs,
                  transcription_completed_at: now,
                  transcription_error: null,
                },
              })
              .eq('id', recordingId);

            sendJson(res, 200, {
              data: { status: 'completed', didWork: true, audioDurationMs, transcriptPath },
            });
          } else if (result.status === 'error') {
            await sb
              .from('anthology_recordings')
              .update({
                metadata: {
                  ...md,
                  transcription_status: 'error',
                  transcription_error: result.error || 'Unknown AssemblyAI error',
                },
              })
              .eq('id', recordingId);

            sendJson(res, 200, {
              data: { status: 'error', didWork: true, error: result.error },
            });
          } else {
            // Still queued / processing
            sendJson(res, 200, {
              data: { status: 'processing', didWork: false, assemblyStatus: result.status },
            });
          }
        } catch (e) {
          sendJson(res, 500, { error: e instanceof Error ? e.message : 'Unknown error' });
        }
      });

      // ── POST /api/transcribe (start) ──
      server.middlewares.use('/api/transcribe', async (req: any, res: any) => {
        if (req.method !== 'POST') { sendJson(res, 405, { error: 'Method not allowed' }); return; }

        const body = await readJsonBody(req);
        if (!body) { sendJson(res, 400, { error: 'Invalid JSON body' }); return; }

        const recordingId = (body as any).recordingId;
        if (!recordingId) { sendJson(res, 400, { error: 'recordingId is required' }); return; }

        const apiKey = process.env.ASSEMBLYAI_API_KEY || process.env.ASSEMBLY_API_KEY;
        if (!apiKey) { sendJson(res, 500, { error: 'Missing ASSEMBLYAI_API_KEY' }); return; }

        try {
          const sb = getSupabase();
          const { data: recording, error: recErr } = await sb
            .from('anthology_recordings')
            .select('id, metadata, mime_type')
            .eq('id', recordingId)
            .single();

          if (recErr || !recording) { sendJson(res, 404, { error: 'Recording not found' }); return; }

          const md = (recording.metadata || {}) as Record<string, unknown>;
          const existing = md.transcription_status as string | undefined;

          // Idempotent: already started or done
          if (existing && ['processing', 'completed'].includes(existing)) {
            sendJson(res, 200, {
              data: {
                recordingId: recording.id,
                status: existing,
                assemblyId: md.assembly_id || null,
                transcriptPath: md.transcript_path || null,
              },
            });
            return;
          }

          const objectPath = md.object_path as string;
          const bucket = (md.bucket as string) || getConversationsBucket();
          if (!objectPath) { sendJson(res, 400, { error: 'Recording metadata is missing object_path' }); return; }

          const { data: fileData, error: downloadErr } = await sb.storage
            .from(bucket)
            .download(objectPath);

          if (downloadErr || !fileData) {
            sendJson(res, 400, { error: `Failed to download recording from storage: ${downloadErr?.message || 'unknown'}` });
            return;
          }

          const audioBuffer = await fileData.arrayBuffer();
          const { uploadUrl } = await assemblyUploadAudio({
            apiKey,
            audioData: audioBuffer,
            contentType: recording.mime_type || 'application/octet-stream',
          });

          const { id: assemblyId } = await assemblyStartTranscription({
            apiKey,
            audioUrl: uploadUrl,
          });
          const transcriptPath = `${objectPath}.transcript.json`;
          const now = new Date().toISOString();

          await sb
            .from('anthology_recordings')
            .update({
              metadata: {
                ...md,
                transcription_status: 'processing',
                assembly_id: assemblyId,
                transcript_path: transcriptPath,
                transcription_started_at: now,
                transcription_error: null,
                transcription_completed_at: null,
                audio_duration_ms: null,
              },
            })
            .eq('id', recordingId);

          sendJson(res, 202, {
            data: { recordingId: recording.id, status: 'processing', assemblyId, transcriptPath },
          });
        } catch (e) {
          sendJson(res, 500, { error: e instanceof Error ? e.message : 'Unknown error' });
        }
      });
    },
  };
}

/**
 * Local dev-only implementation of `/api/judge-question`.
 */
function localJudgeQuestionApiPlugin(env: Record<string, string>) {
  const apiKey = env.ANTHROPIC_API_KEY;
  const ANTHROPIC_API_BASE = 'https://api.anthropic.com/v1';
  const ANTHROPIC_VERSION = '2023-06-01';
  const MODEL = 'claude-haiku-4-5-20251001';

  return {
    name: 'local-judge-question-api',
    configureServer(server: any) {
      server.middlewares.use('/api/judge-question', async (req: any, res: any) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        if (!apiKey) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Missing ANTHROPIC_API_KEY env var' }));
          return;
        }

        const chunks: Buffer[] = [];
        await new Promise<void>((resolve) => {
          req.on('data', (c: Buffer) => chunks.push(c));
          req.on('end', () => resolve());
        });

        let body: Json;
        try {
          body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Json;
        } catch {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Invalid JSON body' }));
          return;
        }

        const transcript = (body as any).transcript;
        const questions = (body as any).questions;

        if (typeof transcript !== 'string' || transcript.trim().length === 0) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'transcript is required' }));
          return;
        }

        if (!Array.isArray(questions) || questions.length === 0) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'questions is required (non-empty array)' }));
          return;
        }

        const normalized = questions
          .map((q: any) => ({ id: q?.id, text: q?.text }))
          .filter((q: any) => typeof q.id === 'string' && typeof q.text === 'string');

        if (normalized.length === 0) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'questions must be array of {id, text}' }));
          return;
        }

        try {
          const prompt = [
            'You are a routing judge for a graph of question nodes.',
            'Given a user transcript, choose the SINGLE best matching question node to attach the response to.',
            '',
            'Return JSON ONLY that matches this schema:',
            '{"best_question_id":"string","ranked_question_ids":["string",...],"reason":"string"}',
            '',
            'Rules:',
            '- best_question_id MUST be one of the provided question ids.',
            '- ranked_question_ids MUST include best_question_id first, then up to 4 additional ids (total max 5).',
            '- reason should be brief (1-2 sentences).',
            '',
            `Transcript:\n${transcript.trim()}`,
            '',
            'Questions (id: text):',
            ...normalized.map((q: any) => `- ${q.id}: ${q.text}`),
          ].join('\n');

          const claudeResp = await fetch(`${ANTHROPIC_API_BASE}/messages`, {
            method: 'POST',
            headers: {
              'x-api-key': apiKey,
              'anthropic-version': ANTHROPIC_VERSION,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: MODEL,
              max_tokens: 500,
              tools: [
                {
                  name: 'question_match',
                  description: 'Return the best matching question for the transcript.',
                  input_schema: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      best_question_id: { type: 'string' },
                      ranked_question_ids: {
                        type: 'array',
                        items: { type: 'string' },
                        minItems: 1,
                        maxItems: 5,
                      },
                      reason: { type: 'string' },
                    },
                    required: ['best_question_id', 'ranked_question_ids', 'reason'],
                  },
                },
              ],
              tool_choice: { type: 'tool', name: 'question_match' },
              messages: [{ role: 'user', content: prompt }],
            }),
          });

          if (!claudeResp.ok) {
            const msg = await claudeResp.text().catch(() => '');
            res.statusCode = 502;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: msg || 'Claude request failed' }));
            return;
          }

          const claudeJson = await claudeResp.json() as any;
          const toolUse = (claudeJson.content as any[])?.find((c: any) => c.type === 'tool_use');
          const parsed = toolUse?.input ?? null;

          const validIds = new Set(normalized.map((q: any) => q.id));
          const fallback = normalized[0].id;
          const best = typeof parsed?.best_question_id === 'string' && validIds.has(parsed.best_question_id)
            ? parsed.best_question_id
            : fallback;

          const rankedRaw: any[] = Array.isArray(parsed?.ranked_question_ids) ? parsed.ranked_question_ids : [best];
          const ranked = rankedRaw
            .filter((id) => typeof id === 'string' && validIds.has(id))
            .filter((id, idx, arr) => arr.indexOf(id) === idx)
            .slice(0, 5);

          if (ranked.length === 0) ranked.push(best);
          if (ranked[0] !== best) ranked.unshift(best);

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ bestQuestionId: best, rankedQuestionIds: ranked, reason: parsed?.reason || '' }));
        } catch (e) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }));
        }
      });
    },
  };
}

/**
 * Local dev-only implementation of `/api/assign-narrative`.
 */
function localAssignNarrativeApiPlugin(env: Record<string, string>) {
  const openaiKey = env.OPENAI_API_KEY;
  const supabaseUrl = env.VITE_SUPABASE_URL;
  const supabaseKey = env.SUPABASE_SERVICE_KEY;
  const supabaseDbSchema = env.SUPABASE_DB_SCHEMA || 'public';

  return {
    name: 'local-assign-narrative-api',
    configureServer(server: any) {
      server.middlewares.use('/api/assign-narrative', async (req: any, res: any) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        if (!openaiKey) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'OPENAI_API_KEY not configured' }));
          return;
        }

        if (!supabaseUrl || !supabaseKey) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_KEY in .env file' }));
          return;
        }

        const chunks: Buffer[] = [];
        await new Promise<void>((resolve) => {
          req.on('data', (c: Buffer) => chunks.push(c));
          req.on('end', () => resolve());
        });

        let body: Json;
        try {
          body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Json;
        } catch {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Invalid JSON body' }));
          return;
        }

        const anthologyId = (body as any).anthologyId;
        const responseText = (body as any).responseText;

        if (!anthologyId || !responseText) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Missing required fields: anthologyId, responseText' }));
          return;
        }

        try {
          const { createClient } = await import('@supabase/supabase-js');
          const supabase = createClient(supabaseUrl, supabaseKey, {
            db: { schema: supabaseDbSchema },
          });

          // Fetch all narratives for this anthology
          const { data: narratives, error: narrativesError } = await supabase
            .from('anthology_narratives')
            .select('id, narrative_text, embedding')
            .eq('anthology_id', anthologyId);

          if (narrativesError) {
            console.error('[assign-narrative] Error fetching narratives:', narrativesError);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Failed to fetch narratives' }));
            return;
          }

          if (!narratives || narratives.length === 0) {
            res.statusCode = 404;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'No narratives found for anthology' }));
            return;
          }

          // Find Misc narrative
          const miscNarrative = narratives.find((n: any) => n.narrative_text === 'Misc');
          if (!miscNarrative) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Misc narrative not found' }));
            return;
          }

          // Filter narratives that have embeddings (excluding Misc)
          const narrativesWithEmbeddings = narratives.filter((n: any) => n.embedding && n.id !== miscNarrative.id);

          // If no narratives have embeddings, assign to Misc
          if (narrativesWithEmbeddings.length === 0) {
            console.log('[assign-narrative] No narrative embeddings found, assigning to Misc');
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ narrativeId: miscNarrative.id, similarity: 0 }));
            return;
          }

          // Generate embedding for response text
          const embeddingResp = await fetch('https://api.openai.com/v1/embeddings', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${openaiKey}`,
            },
            body: JSON.stringify({
              model: 'text-embedding-3-small',
              input: responseText,
              encoding_format: 'float',
            }),
          });

          if (!embeddingResp.ok) {
            const error = await embeddingResp.text();
            res.statusCode = 502;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: `OpenAI API error: ${error}` }));
            return;
          }

          const embeddingData = await embeddingResp.json() as { data: Array<{ embedding: number[] }> };
          const responseEmbedding = embeddingData.data[0].embedding;

          // Calculate cosine similarity
          function cosineSimilarity(a: number[], b: number[]): number {
            let dotProduct = 0;
            let normA = 0;
            let normB = 0;
            for (let i = 0; i < a.length; i++) {
              dotProduct += a[i] * b[i];
              normA += a[i] * a[i];
              normB += b[i] * b[i];
            }
            return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
          }

          // Calculate similarities with all narratives
          // Use "best match" approach: find highest similarity, then check minimum threshold
          let bestNarrativeId = miscNarrative.id;
          let bestNarrativeName = 'Misc';
          let bestSimilarity = 0;
          const minThreshold = 0.25; // Minimum similarity to avoid Misc

          for (const narrative of narrativesWithEmbeddings) {
            let narrativeEmbedding: number[];

            if (typeof narrative.embedding === 'string') {
              if (narrative.embedding.startsWith('[') && narrative.embedding.endsWith(']')) {
                narrativeEmbedding = narrative.embedding
                  .slice(1, -1)
                  .split(',')
                  .map((s: string) => parseFloat(s.trim()));
              } else {
                console.warn(`[assign-narrative] Invalid embedding format for narrative ${narrative.id}`);
                continue;
              }
            } else if (Array.isArray(narrative.embedding)) {
              narrativeEmbedding = narrative.embedding;
            } else {
              console.warn(`[assign-narrative] Unknown embedding type for narrative ${narrative.id}`);
              continue;
            }

            const similarity = cosineSimilarity(responseEmbedding, narrativeEmbedding);
            console.log(`[assign-narrative] Narrative "${narrative.narrative_text}" similarity: ${similarity.toFixed(3)}`);

            if (similarity > bestSimilarity) {
              bestSimilarity = similarity;
              bestNarrativeId = narrative.id;
              bestNarrativeName = narrative.narrative_text;
            }
          }

          // If best match is below minimum threshold, assign to Misc
          if (bestSimilarity < minThreshold) {
            console.log(`[assign-narrative] Best similarity ${bestSimilarity.toFixed(3)} below threshold ${minThreshold}, assigning to Misc`);
            bestNarrativeId = miscNarrative.id;
            bestNarrativeName = 'Misc';
          }

          console.log(`[assign-narrative] Assigned to narrative "${bestNarrativeName}" (${bestNarrativeId}) with similarity ${bestSimilarity.toFixed(3)}`);

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ narrativeId: bestNarrativeId, similarity: bestSimilarity }));
        } catch (e) {
          console.error('[assign-narrative] Error:', e);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }));
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  // Load all env vars (NOT just VITE_*) for dev server middleware.
  const env = loadEnv(mode, __dirname, '');

  // Make env available to shared server helpers (used by sensemaking handlers)
  // NOTE: loadEnv returns strings; safe for process.env assignment.
  Object.assign(process.env, env);

  return {
    plugins: [
      react(),
      command === 'serve' ? localTranscribeAsyncApiPlugin() : undefined,
      command === 'serve' ? localJudgeQuestionApiPlugin(env) : undefined,
      command === 'serve' ? localAssignNarrativeApiPlugin(env) : undefined,
      command === 'serve'
        ? {
          name: 'local-sensemaking-api',
          configureServer(server: any) {
            // POST /api/sensemaking/start
            server.middlewares.use('/api/sensemaking/start', async (req: any, res: any) => {
              if (req.method !== 'POST') {
                res.statusCode = 405;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Method not allowed' }));
                return;
              }

              const chunks: Buffer[] = [];
              await new Promise<void>((resolve) => {
                req.on('data', (c: Buffer) => chunks.push(c));
                req.on('end', () => resolve());
              });

              let body: Json;
              try {
                body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Json;
              } catch {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Invalid JSON body' }));
                return;
              }

                try {
                  const result = await startSensemaking({
                    anthologyId: (body as any).anthologyId ? String((body as any).anthologyId) : undefined,
                    anthologySlug: String((body as any).anthologySlug || ''),
                    anthologyTitle: String((body as any).anthologyTitle || ''),
                    templateQuestions: Array.isArray((body as any).templateQuestions)
                      ? (body as any).templateQuestions
                          .filter((q: any) => typeof q === 'string' && q.trim().length > 0)
                          .map((q: string) => q.trim())
                      : [],
                    templateNarratives: Array.isArray((body as any).templateNarratives)
                      ? (body as any).templateNarratives
                          .filter((n: any) => typeof n === 'string' && n.trim().length > 0)
                          .map((n: string) => n.trim())
                      : [],
                    uploadedFilePaths: Array.isArray((body as any).uploadedFilePaths)
                      ? (body as any).uploadedFilePaths.filter((p: any) => typeof p === 'string' && p.trim().length > 0)
                      : [],
                    includePreviousUploads: Boolean((body as any).includePreviousUploads),
                  });

                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(result));
              } catch (e) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }));
              }
            });

            // POST /api/sensemaking/tick
            server.middlewares.use('/api/sensemaking/tick', async (req: any, res: any) => {
              if (req.method !== 'POST') {
                res.statusCode = 405;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Method not allowed' }));
                return;
              }

              const chunks: Buffer[] = [];
              await new Promise<void>((resolve) => {
                req.on('data', (c: Buffer) => chunks.push(c));
                req.on('end', () => resolve());
              });

              let body: Json;
              try {
                body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Json;
              } catch {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Invalid JSON body' }));
                return;
              }

              const jobId = String((body as any).jobId || '');
              const timeBudgetMs = (body as any).timeBudgetMs;
              if (!jobId) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'jobId is required' }));
                return;
              }

              try {
                const result = await tickSensemaking({
                  jobId,
                  timeBudgetMs: typeof timeBudgetMs === 'number' && timeBudgetMs > 0 ? timeBudgetMs : 15000,
                });
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(result));
              } catch (e) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }));
              }
            });

            // GET /api/sensemaking/status?jobId=...
            server.middlewares.use('/api/sensemaking/status', async (req: any, res: any) => {
              if (req.method !== 'GET') {
                res.statusCode = 405;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Method not allowed' }));
                return;
              }

              const url = new URL(req.url, 'http://localhost');
              const jobId = url.searchParams.get('jobId') || '';
              if (!jobId) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'jobId is required' }));
                return;
              }

              try {
                const result = await getSensemakingStatus(jobId);
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(result));
              } catch (e) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }));
              }
            });
          },
        }
        : undefined,
    ].filter(Boolean),
    css: {
      modules: {
        localsConvention: 'camelCase',
        scopeBehaviour: 'local',
        generateScopedName: '[name]__[local]__[hash:base64:5]'
      }
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@components': path.resolve(__dirname, './src/components'),
        '@stores': path.resolve(__dirname, './src/stores'),
        '@hooks': path.resolve(__dirname, './src/hooks'),
        '@utils': path.resolve(__dirname, './src/utils'),
        '@types': path.resolve(__dirname, './src/types'),
        '@styles': path.resolve(__dirname, './src/styles'),
      }
    },
    server: {
      proxy: {
        // Proxy REST API requests to the local API server
        // Middleware plugins above handle: /api/transcribe(/status|/tick), /api/judge-question,
        // /api/assign-narrative, /api/sensemaking/*
        // All other /api/* requests go to the Express API server
        '/api/anthologies': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
        '/api/recordings': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
        '/api/conversations': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
        '/api/questions': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
        '/api/responses': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
        '/api/narratives': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
        '/api/speakers': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
        '/api/graph': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
        '/api/docs': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
      },
    },
  };
})

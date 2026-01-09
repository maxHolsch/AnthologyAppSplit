import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

import { startSensemaking, tickSensemaking, getSensemakingStatus } from './api/_lib/sensemaking';

type Json = Record<string, unknown>;

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

/**
 * Local dev-only implementation of `/api/transcribe`.
 *
 * In production (Vercel), `/api/transcribe` is served by [`api/transcribe.ts`](anthology-app/api/transcribe.ts:1).
 * In local dev (`vite dev`), Vite does not serve the `/api` folder, so we add
 * a middleware route here.
 */
function localTranscribeApiPlugin(env: Record<string, string>) {
  const apiKey = env.ASSEMBLYAI_API_KEY || env.ASSEMBLY_API_KEY;
  const ASSEMBLY_API_BASE = 'https://api.assemblyai.com/v2';

  return {
    name: 'local-transcribe-api',
    configureServer(server: any) {
      server.middlewares.use('/api/transcribe', async (req: any, res: any) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        if (!apiKey) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Missing ASSEMBLYAI_API_KEY env var' }));
          return;
        }

        // Read JSON body
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

        const audioUrl = body.audioUrl;
        if (typeof audioUrl !== 'string' || audioUrl.length === 0) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'audioUrl is required' }));
          return;
        }

        try {
          // 1) Start transcription
          const createResp = await fetch(`${ASSEMBLY_API_BASE}/transcript`, {
            method: 'POST',
            headers: {
              Authorization: apiKey,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              audio_url: audioUrl,
              punctuate: true,
              format_text: true,
            }),
          });

          if (!createResp.ok) {
            const msg = await createResp.text().catch(() => '');
            res.statusCode = 502;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: msg || 'Failed to create transcription job' }));
            return;
          }

          const created = (await createResp.json()) as { id?: string };
          if (!created.id) {
            res.statusCode = 502;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'AssemblyAI returned no transcript id' }));
            return;
          }

          // 2) Poll until completion
          for (let i = 0; i < 120; i++) {
            const pollResp = await fetch(`${ASSEMBLY_API_BASE}/transcript/${created.id}`, {
              headers: { Authorization: apiKey },
            });

            if (!pollResp.ok) {
              const msg = await pollResp.text().catch(() => '');
              res.statusCode = 502;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: msg || 'Failed to poll transcription job' }));
              return;
            }

            const data = (await pollResp.json()) as any;
            if (data.status === 'completed') {
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(
                JSON.stringify({
                  text: data.text || '',
                  words: Array.isArray(data.words)
                    ? data.words.map((w: any) => ({
                        text: w.text,
                        start: w.start,
                        end: w.end,
                        confidence: w.confidence,
                      }))
                    : [],
                })
              );
              return;
            }

            if (data.status === 'error') {
              res.statusCode = 502;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: data.error || 'Transcription failed' }));
              return;
            }

            await sleep(1500);
          }

          res.statusCode = 504;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Transcription timed out' }));
        } catch (e) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }));
        }
      });
    },
  };
}

function extractOpenAIOutputText(openaiResponse: any): string {
  if (typeof openaiResponse?.output_text === 'string') return openaiResponse.output_text;

  const output = openaiResponse?.output;
  if (!Array.isArray(output)) return '';

  const texts: string[] = [];
  for (const item of output) {
    const content = item?.content;
    if (!Array.isArray(content)) continue;
    for (const c of content) {
      const t = c?.text;
      if (typeof t === 'string') texts.push(t);
    }
  }
  return texts.join('\n').trim();
}

function safeJsonParse(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Local dev-only implementation of `/api/judge-question`.
 */
function localJudgeQuestionApiPlugin(env: Record<string, string>) {
  const apiKey = env.OPENAI_API_KEY;
  const OPENAI_API_BASE = 'https://api.openai.com/v1';
  const MODEL = 'gpt-5-mini-2025-08-07';

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
          res.end(JSON.stringify({ error: 'Missing OPENAI_API_KEY env var' }));
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

          const openaiResp = await fetch(`${OPENAI_API_BASE}/responses`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: MODEL,
              input: prompt,
              text: {
                format: {
                  type: 'json_schema',
                  name: 'question_match',
                  strict: true,
                  schema: {
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
              },
            }),
          });

          if (!openaiResp.ok) {
            const msg = await openaiResp.text().catch(() => '');
            res.statusCode = 502;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: msg || 'OpenAI request failed' }));
            return;
          }

          const openaiJson = await openaiResp.json();
          const outputText = extractOpenAIOutputText(openaiJson);
          const parsed = safeJsonParse(outputText);

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
      command === 'serve' ? localTranscribeApiPlugin(env) : undefined,
      command === 'serve' ? localJudgeQuestionApiPlugin(env) : undefined,
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
                    anthologySlug: String((body as any).anthologySlug || ''),
                    anthologyTitle: String((body as any).anthologyTitle || ''),
                    templateQuestions: Array.isArray((body as any).templateQuestions)
                      ? (body as any).templateQuestions
                          .filter((q: any) => typeof q === 'string' && q.trim().length > 0)
                          .map((q: string) => q.trim())
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
  }
  };
})

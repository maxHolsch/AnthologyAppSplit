import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

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

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  // Load all env vars (NOT just VITE_*) for dev server middleware.
  const env = loadEnv(mode, __dirname, '');

  return {
    plugins: [react(), command === 'serve' ? localTranscribeApiPlugin(env) : undefined].filter(Boolean),
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

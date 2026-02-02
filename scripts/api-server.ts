/**
 * Local API Development Server
 * Runs Vercel API functions locally using Express
 *
 * Usage: npx tsx scripts/api-server.ts
 */

import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const app = express();
const PORT = 3001;

app.use(express.json());

// Adapter to convert Express req/res to Vercel format
function createVercelAdapter(handler: (req: VercelRequest, res: VercelResponse) => Promise<void> | void) {
  return async (req: Request, res: Response) => {
    // Create a mock Vercel request with the necessary properties
    const vercelReq = {
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: req.body,
      query: { ...req.query, ...req.params } as Record<string, string | string[]>,
      cookies: req.cookies || {},
    } as VercelRequest;

    // Create a mock Vercel response
    let statusCode = 200;
    const vercelRes = {
      status: (code: number) => {
        statusCode = code;
        res.status(code);
        return vercelRes;
      },
      json: (data: unknown) => {
        res.status(statusCode).json(data);
        return vercelRes;
      },
      send: (data: unknown) => {
        res.status(statusCode).send(data);
        return vercelRes;
      },
      setHeader: (name: string, value: string | number | readonly string[]) => {
        res.setHeader(name, value);
        return vercelRes;
      },
      end: () => {
        res.end();
        return vercelRes;
      },
    } as unknown as VercelResponse;

    try {
      await handler(vercelReq, vercelRes);
    } catch (error) {
      console.error('Handler error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error', details: String(error) });
      }
    }
  };
}

// Register API routes
async function registerRoutes() {
  // Docs - doesn't require Supabase, register first
  try {
    const docs = await import('../api/docs/index.js');
    app.get('/api/docs', createVercelAdapter(docs.default));
    console.log('✅ /api/docs registered');
  } catch (err) {
    console.error('❌ Failed to register /api/docs:', err);
  }

  // Check if Supabase env vars are set before registering other routes
  const hasSupabase = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  if (!hasSupabase) {
    console.log('\n⚠️  No Supabase credentials found in environment.');
    console.log('   Only /api/docs is available.');
    console.log('   Create a .env file from .env.example to enable all API routes.\n');
    return;
  }

  // Anthologies
  const anthologies = await import('../api/anthologies/index.js');
  app.get('/api/anthologies', createVercelAdapter(anthologies.default));

  const anthologyBySlug = await import('../api/anthologies/[slug].js');
  app.get('/api/anthologies/:slug', createVercelAdapter(anthologyBySlug.default));

  // Conversations
  const conversations = await import('../api/conversations/index.js');
  app.get('/api/conversations', createVercelAdapter(conversations.default));

  const conversationById = await import('../api/conversations/[id].js');
  app.get('/api/conversations/:id', createVercelAdapter(conversationById.default));

  const conversationSpeakers = await import('../api/conversations/[id]/speakers.js');
  app.get('/api/conversations/:id/speakers', createVercelAdapter(conversationSpeakers.default));

  const conversationQuestions = await import('../api/conversations/[id]/questions.js');
  app.get('/api/conversations/:id/questions', createVercelAdapter(conversationQuestions.default));

  const conversationResponses = await import('../api/conversations/[id]/responses.js');
  app.get('/api/conversations/:id/responses', createVercelAdapter(conversationResponses.default));

  const conversationNarratives = await import('../api/conversations/[id]/narratives.js');
  app.get('/api/conversations/:id/narratives', createVercelAdapter(conversationNarratives.default));

  // Questions
  const questions = await import('../api/questions/index.js');
  app.get('/api/questions', createVercelAdapter(questions.default));

  const questionResponses = await import('../api/questions/[id]/responses.js');
  app.get('/api/questions/:id/responses', createVercelAdapter(questionResponses.default));

  // Responses
  const responses = await import('../api/responses/index.js');
  app.get('/api/responses', createVercelAdapter(responses.default));
  app.post('/api/responses', createVercelAdapter(responses.default));

  const responseById = await import('../api/responses/[id].js');
  app.get('/api/responses/:id', createVercelAdapter(responseById.default));
  app.patch('/api/responses/:id', createVercelAdapter(responseById.default));
  app.delete('/api/responses/:id', createVercelAdapter(responseById.default));

  const wordTimestamps = await import('../api/responses/[id]/word-timestamps.js');
  app.get('/api/responses/:id/word-timestamps', createVercelAdapter(wordTimestamps.default));

  // Narratives
  const narratives = await import('../api/narratives/index.js');
  app.get('/api/narratives', createVercelAdapter(narratives.default));

  const narrativeResponses = await import('../api/narratives/[id]/responses.js');
  app.get('/api/narratives/:id/responses', createVercelAdapter(narrativeResponses.default));

  // Speakers
  const speakers = await import('../api/speakers/index.js');
  app.get('/api/speakers', createVercelAdapter(speakers.default));
  app.post('/api/speakers', createVercelAdapter(speakers.default));

  const speakerById = await import('../api/speakers/[id].js');
  app.get('/api/speakers/:id', createVercelAdapter(speakerById.default));

  // Graph
  const graphLoad = await import('../api/graph/load.js');
  app.get('/api/graph/load', createVercelAdapter(graphLoad.default));

  console.log('✅ All API routes registered');
}

// Start server
registerRoutes().then(() => {
  app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║                 Local API Server Running                        ║
╠════════════════════════════════════════════════════════════════╣
║  API Server:     http://localhost:${PORT}                         ║
║  API Docs:       http://localhost:${PORT}/api/docs                ║
║  Anthologies:    http://localhost:${PORT}/api/anthologies         ║
║  Conversations:  http://localhost:${PORT}/api/conversations       ║
╠════════════════════════════════════════════════════════════════╣
║  Run Vite separately: npm run dev                               ║
╚════════════════════════════════════════════════════════════════╝
    `);
  });
}).catch(err => {
  console.error('Failed to register routes:', err);
  process.exit(1);
});

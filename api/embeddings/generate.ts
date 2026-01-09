/**
 * POST /api/embeddings/generate
 *
 * Generate embeddings for an array of texts using OpenAI's embeddings API.
 * Used for semantic positioning in the visualization.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { generateEmbeddings, EMBEDDINGS_DIMENSIONS } from '../_lib/openai';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} env var`);
  return v;
}

type RequestBody = {
  texts: string[];
};

type ResponseBody = {
  embeddings: number[][];
  dimensions: number;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const openaiKey = requireEnv('OPENAI_API_KEY');

    const body = req.body as RequestBody;
    const texts = body?.texts;

    if (!Array.isArray(texts)) {
      return res.status(400).json({ error: 'texts must be an array of strings' });
    }

    if (texts.length === 0) {
      return res.status(200).json({ embeddings: [], dimensions: EMBEDDINGS_DIMENSIONS });
    }

    // Validate texts are all strings
    const validTexts = texts.filter((t): t is string => typeof t === 'string' && t.length > 0);
    if (validTexts.length !== texts.length) {
      return res.status(400).json({ error: 'All texts must be non-empty strings' });
    }

    // Generate embeddings
    const embeddings = await generateEmbeddings({
      apiKey: openaiKey,
      texts: validTexts,
    });

    const response: ResponseBody = {
      embeddings,
      dimensions: EMBEDDINGS_DIMENSIONS,
    };

    return res.status(200).json(response);
  } catch (err) {
    console.error('[embeddings/generate] Error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ error: message });
  }
}

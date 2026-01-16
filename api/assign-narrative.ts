/**
 * API endpoint: /api/assign-narrative
 * Assigns a narrative to a response text based on semantic similarity
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const openaiKey = process.env.OPENAI_API_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing required environment variables: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface AssignNarrativeRequest {
  anthologyId: string;
  responseText: string;
}

interface AssignNarrativeResponse {
  narrativeId: string;
  similarity: number;
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }

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

/**
 * Generate embedding using OpenAI API
 */
async function generateEmbedding(text: string): Promise<number[]> {
  if (!openaiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openaiKey}`
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text,
      encoding_format: 'float'
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { anthologyId, responseText } = req.body as AssignNarrativeRequest;

    if (!anthologyId || !responseText) {
      return res.status(400).json({ error: 'Missing required fields: anthologyId, responseText' });
    }

    // Fetch all narratives for this anthology
    const { data: narratives, error: narrativesError } = await supabase
      .from('anthology_narratives')
      .select('id, narrative_text, embedding')
      .eq('anthology_id', anthologyId);

    if (narrativesError) {
      console.error('[assign-narrative] Error fetching narratives:', narrativesError);
      return res.status(500).json({ error: 'Failed to fetch narratives' });
    }

    if (!narratives || narratives.length === 0) {
      return res.status(404).json({ error: 'No narratives found for anthology' });
    }

    // Find Misc narrative
    const miscNarrative = narratives.find(n => n.narrative_text === 'Misc');
    if (!miscNarrative) {
      return res.status(500).json({ error: 'Misc narrative not found' });
    }

    // Filter narratives that have embeddings (excluding Misc)
    const narrativesWithEmbeddings = narratives.filter(n =>
      n.embedding && n.id !== miscNarrative.id
    );

    // If no narratives have embeddings, assign to Misc
    if (narrativesWithEmbeddings.length === 0) {
      console.log('[assign-narrative] No narrative embeddings found, assigning to Misc');
      return res.status(200).json({
        narrativeId: miscNarrative.id,
        similarity: 0
      } as AssignNarrativeResponse);
    }

    // Generate embedding for response text
    const responseEmbedding = await generateEmbedding(responseText);

    // Calculate similarities with all narratives
    // Use "best match" approach: find highest similarity, then check minimum threshold
    let bestNarrativeId = miscNarrative.id;
    let bestNarrativeName = 'Misc';
    let bestSimilarity = 0;
    const minThreshold = 0.25; // Minimum similarity to avoid Misc

    for (const narrative of narrativesWithEmbeddings) {
      // Parse PostgreSQL vector string to number array
      let narrativeEmbedding: number[];

      if (typeof narrative.embedding === 'string') {
        if (narrative.embedding.startsWith('[') && narrative.embedding.endsWith(']')) {
          narrativeEmbedding = narrative.embedding
            .slice(1, -1)
            .split(',')
            .map(s => parseFloat(s.trim()));
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

    return res.status(200).json({
      narrativeId: bestNarrativeId,
      similarity: bestSimilarity
    } as AssignNarrativeResponse);

  } catch (error) {
    console.error('[assign-narrative] Error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

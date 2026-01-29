// Vercel Serverless Function
// POST /api/transcribe
// Body: { audioUrl: string }
//
// This endpoint uses the shared AssemblyAI library for consistent transcription
// with speaker diarization and reliable word-level timestamps.

import { assemblyTranscribeBlocking } from './_lib/assemblyai.js';

type Json = Record<string, unknown>;

export default async function handler(req: any, res: any) {
  console.log('[transcribe] Handler invoked, method:', req.method);
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.ASSEMBLYAI_API_KEY || process.env.ASSEMBLY_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Missing ASSEMBLYAI_API_KEY env var' });
    return;
  }

  let body: Json;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body as Json);
  } catch {
    res.status(400).json({ error: 'Invalid JSON body' });
    return;
  }

  const audioUrl = body.audioUrl;
  if (typeof audioUrl !== 'string' || audioUrl.length === 0) {
    res.status(400).json({ error: 'audioUrl is required' });
    return;
  }

  try {
    console.log('[transcribe] Starting transcription for:', audioUrl);
    // Use the shared library which enables speaker_labels for reliable word timestamps
    const transcript = await assemblyTranscribeBlocking({
      apiKey,
      audioUrl,
      maxPolls: 120,
      pollMs: 1500,
    });
    console.log('[transcribe] Completed successfully');

    // Return in the same format the frontend expects
    res.status(200).json({
      text: transcript.text || '',
      words: Array.isArray(transcript.words)
        ? transcript.words.map((w) => ({
          text: w.text,
          start: w.start,
          end: w.end,
          confidence: w.confidence,
        }))
        : [],
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';

    // Determine appropriate status code based on error
    if (message.includes('timed out')) {
      res.status(504).json({ error: message });
    } else if (message.includes('Failed to create') || message.includes('Failed to poll')) {
      res.status(502).json({ error: message });
    } else {
      res.status(500).json({ error: message });
    }
  }
}

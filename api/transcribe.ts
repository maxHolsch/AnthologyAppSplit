// Vercel Serverless Function
// POST /api/transcribe
// Body: { audioUrl: string }

type Json = Record<string, unknown>;

const ASSEMBLY_API_BASE = 'https://api.assemblyai.com/v2';

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

export default async function handler(req: any, res: any) {
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
        // word-level timestamps
        // AssemblyAI includes "words" in the response when completed.
      }),
    });

    if (!createResp.ok) {
      const msg = await createResp.text().catch(() => '');
      res.status(502).json({ error: msg || 'Failed to create transcription job' });
      return;
    }

    const created = (await createResp.json()) as { id?: string };
    if (!created.id) {
      res.status(502).json({ error: 'AssemblyAI returned no transcript id' });
      return;
    }

    // 2) Poll until completion
    for (let i = 0; i < 120; i++) {
      const pollResp = await fetch(`${ASSEMBLY_API_BASE}/transcript/${created.id}`, {
        headers: { Authorization: apiKey },
      });

      if (!pollResp.ok) {
        const msg = await pollResp.text().catch(() => '');
        res.status(502).json({ error: msg || 'Failed to poll transcription job' });
        return;
      }

      const data = (await pollResp.json()) as any;
      if (data.status === 'completed') {
        res.status(200).json({
          text: data.text || '',
          words: Array.isArray(data.words)
            ? data.words.map((w: any) => ({
                text: w.text,
                start: w.start,
                end: w.end,
                confidence: w.confidence,
              }))
            : [],
        });
        return;
      }

      if (data.status === 'error') {
        res.status(502).json({ error: data.error || 'Transcription failed' });
        return;
      }

      await sleep(1500);
    }

    res.status(504).json({ error: 'Transcription timed out' });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Unknown error' });
  }
}


export interface TranscriptionResult {
  text: string;
  words?: Array<{ text: string; start: number; end: number; confidence?: number }>;
}

export async function transcribeAudioUrl(audioUrl: string): Promise<TranscriptionResult> {
  let res: Response;
  try {
    res = await fetch('/api/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioUrl }),
    });
  } catch (e) {
    // This usually happens in local dev when the Vercel serverless function isn't running.
    // (Vite's `npm run dev` does not serve files in `/api`.)
    if (import.meta.env.DEV) {
      throw new Error(
        'Transcription API is unreachable at /api/transcribe. In local dev, this is served by Vite dev middleware (make sure `npm run dev` is running). In production, it is served by the Vercel serverless function.'
      );
    }
    throw new Error(e instanceof Error ? e.message : 'Transcription request failed');
  }

  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(msg || `Transcription failed (${res.status})`);
  }

  return (await res.json()) as TranscriptionResult;
}

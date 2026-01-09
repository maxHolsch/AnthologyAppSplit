const ASSEMBLY_API_BASE = 'https://api.assemblyai.com/v2';

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

export type AssemblyUtteranceWord = {
  text: string;
  start: number;
  end: number;
  confidence?: number;
  speaker?: string;
};

export type AssemblyUtterance = {
  speaker: string;
  text: string;
  start: number;
  end: number;
  words?: Array<{ text: string; start: number; end: number; confidence?: number }>;
};

export type AssemblyTranscript = {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'error';
  error?: string;
  text?: string;
  audio_duration?: number;
  utterances?: AssemblyUtterance[];
  words?: Array<{ text: string; start: number; end: number; confidence?: number }>;
};

export async function assemblyStartTranscription({
  apiKey,
  audioUrl,
}: {
  apiKey: string;
  audioUrl: string;
}): Promise<{ id: string }> {
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
      // Speaker diarization (required for per-turn processing)
      speaker_labels: true,
    }),
  });

  if (!createResp.ok) {
    const msg = await createResp.text().catch(() => '');
    throw new Error(msg || 'Failed to create transcription job');
  }

  const created = (await createResp.json()) as { id?: string };
  if (!created.id) throw new Error('AssemblyAI returned no transcript id');
  return { id: created.id };
}

export async function assemblyPollTranscript({
  apiKey,
  transcriptId,
}: {
  apiKey: string;
  transcriptId: string;
}): Promise<AssemblyTranscript> {
  const resp = await fetch(`${ASSEMBLY_API_BASE}/transcript/${transcriptId}`, {
    headers: { Authorization: apiKey },
  });

  if (!resp.ok) {
    const msg = await resp.text().catch(() => '');
    throw new Error(msg || 'Failed to poll transcription job');
  }

  return (await resp.json()) as AssemblyTranscript;
}

/**
 * Convenience helper for small files; do NOT use for long jobs (tick loop should use start+poll).
 */
export async function assemblyTranscribeBlocking({
  apiKey,
  audioUrl,
  maxPolls = 120,
  pollMs = 1500,
}: {
  apiKey: string;
  audioUrl: string;
  maxPolls?: number;
  pollMs?: number;
}): Promise<AssemblyTranscript> {
  const { id } = await assemblyStartTranscription({ apiKey, audioUrl });
  for (let i = 0; i < maxPolls; i++) {
    const data = await assemblyPollTranscript({ apiKey, transcriptId: id });
    if (data.status === 'completed') return data;
    if (data.status === 'error') throw new Error(data.error || 'Transcription failed');
    await sleep(pollMs);
  }
  throw new Error('Transcription timed out');
}

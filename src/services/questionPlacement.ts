export interface QuestionPlacementCandidate {
  id: string;
  text: string;
}

export interface QuestionPlacementResult {
  bestQuestionId: string;
  rankedQuestionIds: string[];
  reason?: string;
}

export async function judgeQuestionPlacement(
  transcript: string,
  questions: QuestionPlacementCandidate[]
): Promise<QuestionPlacementResult> {
  let res: Response;
  try {
    res = await fetch('/api/judge-question', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript, questions }),
    });
  } catch (e) {
    if (import.meta.env.DEV) {
      throw new Error(
        'Judge API is unreachable at /api/judge-question. In local dev, this is served by Vite dev middleware (make sure `npm run dev` is running). In production, it is served by the Vercel serverless function.'
      );
    }
    throw new Error(e instanceof Error ? e.message : 'Judge request failed');
  }

  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(msg || `Judge request failed (${res.status})`);
  }

  return (await res.json()) as QuestionPlacementResult;
}


// Vercel Serverless Function
// POST /api/judge-question
// Body: { transcript: string, questions: Array<{ id: string; text: string }> }

type Json = Record<string, unknown>;

const OPENAI_API_BASE = 'https://api.openai.com/v1';
const MODEL = 'gpt-5-mini-2025-08-07';

function extractOutputText(openaiResponse: any): string {
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
    // Try to extract the first JSON object
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      const candidate = text.slice(start, end + 1);
      try {
        return JSON.parse(candidate);
      } catch {
        return null;
      }
    }
    return null;
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Missing OPENAI_API_KEY env var' });
    return;
  }

  let body: Json;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body as Json);
  } catch {
    res.status(400).json({ error: 'Invalid JSON body' });
    return;
  }

  const transcript = body.transcript;
  const questions = body.questions;

  if (typeof transcript !== 'string' || transcript.trim().length === 0) {
    res.status(400).json({ error: 'transcript is required' });
    return;
  }

  if (!Array.isArray(questions) || questions.length === 0) {
    res.status(400).json({ error: 'questions is required (non-empty array)' });
    return;
  }

  const normalizedQuestions = questions
    .map((q: any) => ({ id: q?.id, text: q?.text }))
    .filter((q: any) => typeof q.id === 'string' && typeof q.text === 'string');

  if (normalizedQuestions.length === 0) {
    res.status(400).json({ error: 'questions must be array of {id, text}' });
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
      ...normalizedQuestions.map((q: any) => `- ${q.id}: ${q.text}`),
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
        // Encourage strict JSON output.
        // NOTE: `response_format` moved to `text.format` in the Responses API.
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
      res.status(502).json({ error: msg || 'OpenAI request failed' });
      return;
    }

    const openaiJson = await openaiResp.json();
    const outputText = extractOutputText(openaiJson);
    const parsed = safeJsonParse(outputText);

    const validIds = new Set(normalizedQuestions.map((q: any) => q.id));
    const fallback = normalizedQuestions[0].id;

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

    const reason = typeof parsed?.reason === 'string' ? parsed.reason : '';

    res.status(200).json({ bestQuestionId: best, rankedQuestionIds: ranked, reason });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Unknown error' });
  }
}

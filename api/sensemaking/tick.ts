// Vercel Serverless Function
// POST /api/sensemaking/tick

import { readJsonBody, sendJson } from '../_lib/http';
import { tickSensemaking } from '../_lib/sensemaking';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const jobId = body.jobId;
    const timeBudgetMs = body.timeBudgetMs;

    if (typeof jobId !== 'string' || jobId.length === 0) {
      sendJson(res, 400, { error: 'jobId is required' });
      return;
    }

    const result = await tickSensemaking({
      jobId,
      timeBudgetMs: typeof timeBudgetMs === 'number' && timeBudgetMs > 0 ? timeBudgetMs : 15000,
    });

    sendJson(res, 200, result);
  } catch (e) {
    // Surface useful debugging details in dev, while keeping a stable error envelope.
    // (Vite dev server will print this to the terminal.)
    // eslint-disable-next-line no-console
    console.error('[api/sensemaking/tick] error', e);

    const err: any = e;
    const message =
      e instanceof Error
        ? e.message
        : typeof err?.message === 'string'
          ? err.message
          : typeof err === 'string'
            ? err
            : 'Unknown error';

    const stack = e instanceof Error ? e.stack : undefined;

    sendJson(res, 500, {
      error: message,
      ...(process.env.NODE_ENV !== 'production' ? { stack } : null),
    });
  }
}

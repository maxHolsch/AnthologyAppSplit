// Vercel Serverless Function
// GET /api/sensemaking/status?jobId=...

import { sendJson } from '../_lib/http.js';
import { getSensemakingStatus } from '../_lib/sensemaking.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  try {
    const url = new URL(req.url, 'http://localhost');
    const jobId = url.searchParams.get('jobId') || '';
    if (!jobId) {
      sendJson(res, 400, { error: 'jobId is required' });
      return;
    }

    const result = await getSensemakingStatus(jobId);
    sendJson(res, 200, result);
  } catch (e) {
    sendJson(res, 500, { error: e instanceof Error ? e.message : 'Unknown error' });
  }
}


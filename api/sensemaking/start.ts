// Vercel Serverless Function
// POST /api/sensemaking/start

import { readJsonBody, sendJson } from '../_lib/http';
import { startSensemaking } from '../_lib/sensemaking';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const anthologySlug = body.anthologySlug;
    const anthologyTitle = body.anthologyTitle;
    const templateQuestions = body.templateQuestions;
    const templateNarratives = body.templateNarratives;
    const uploadedFilePaths = body.uploadedFilePaths;
    const includePreviousUploads = body.includePreviousUploads;

    if (typeof anthologySlug !== 'string' || anthologySlug.length === 0) {
      sendJson(res, 400, { error: 'anthologySlug is required' });
      return;
    }
    if (typeof anthologyTitle !== 'string' || anthologyTitle.length === 0) {
      sendJson(res, 400, { error: 'anthologyTitle is required' });
      return;
    }
    if (!Array.isArray(templateQuestions) || templateQuestions.length === 0) {
      sendJson(res, 400, { error: 'templateQuestions must be a non-empty array' });
      return;
    }
    if (!Array.isArray(uploadedFilePaths) || uploadedFilePaths.length === 0) {
      sendJson(res, 400, { error: 'uploadedFilePaths must be a non-empty array' });
      return;
    }
    if (templateNarratives !== undefined && !Array.isArray(templateNarratives)) {
      sendJson(res, 400, { error: 'templateNarratives must be an array if provided' });
      return;
    }

    const result = await startSensemaking({
      anthologySlug,
      anthologyTitle,
      templateQuestions: templateQuestions.filter((q: any) => typeof q === 'string' && q.trim().length > 0),
      templateNarratives: Array.isArray(templateNarratives)
        ? templateNarratives.filter((n: any) => typeof n === 'string' && n.trim().length > 0)
        : [],
      uploadedFilePaths: uploadedFilePaths.filter((p: any) => typeof p === 'string' && p.trim().length > 0),
      includePreviousUploads: Boolean(includePreviousUploads),
    });

    sendJson(res, 200, result);
  } catch (e) {
    sendJson(res, 500, { error: e instanceof Error ? e.message : 'Unknown error' });
  }
}


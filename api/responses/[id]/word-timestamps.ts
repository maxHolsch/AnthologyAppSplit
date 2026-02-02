/**
 * API endpoint: GET /api/responses/:id/word-timestamps
 * Get word timestamps for a response (for karaoke highlighting)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../../_lib/supabase';
import { jsonResponse, handleError, errorResponse } from '../../_lib/response';
import { ResponseByIdSchema, safeParseQuery } from '../../_lib/validation';
import { ErrorCodes } from '../../_lib/errors';
import type { ApiWordTimestamp } from '../../../shared/types/api.types';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return errorResponse(res, ErrorCodes.METHOD_NOT_ALLOWED, 'Method not allowed', {
      allowedMethods: ['GET'],
    });
  }

  try {
    const parsed = safeParseQuery(ResponseByIdSchema, req.query);

    if (!parsed.success) {
      return errorResponse(res, ErrorCodes.VALIDATION_ERROR, 'Invalid parameters', {
        fieldErrors: parsed.error.flatten().fieldErrors,
      });
    }

    const { id } = parsed.data;

    const { data, error } = await supabase
      .from('anthology_word_timestamps')
      .select('*')
      .eq('response_id', id)
      .order('word_order', { ascending: true });

    if (error) {
      console.error('[GET /api/responses/:id/word-timestamps] Database error:', error);
      return errorResponse(res, ErrorCodes.DATABASE_ERROR, 'Failed to fetch word timestamps');
    }

    const wordTimestamps: ApiWordTimestamp[] = (data || []).map((row: any) => ({
      text: row.text,
      start: row.start_ms,
      end: row.end_ms,
      confidence: row.confidence || 0,
      speaker: row.speaker || '',
    }));

    return jsonResponse(res, wordTimestamps);
  } catch (error) {
    return handleError(res, error);
  }
}

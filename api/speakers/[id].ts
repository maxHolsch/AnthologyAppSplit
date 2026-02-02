/**
 * API endpoint: GET /api/speakers/:id
 * Get a single speaker by ID
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../_lib/supabase';
import { jsonResponse, handleError, errorResponse } from '../_lib/response';
import { SpeakerByIdSchema, safeParseQuery } from '../_lib/validation';
import { ErrorCodes, notFound } from '../_lib/errors';
import type { ApiSpeaker } from '../../shared/types/api.types';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return errorResponse(res, ErrorCodes.METHOD_NOT_ALLOWED, 'Method not allowed', {
      allowedMethods: ['GET'],
    });
  }

  try {
    const parsed = safeParseQuery(SpeakerByIdSchema, req.query);

    if (!parsed.success) {
      return errorResponse(res, ErrorCodes.VALIDATION_ERROR, 'Invalid parameters', {
        fieldErrors: parsed.error.flatten().fieldErrors,
      });
    }

    const { id } = parsed.data;

    const { data, error } = await supabase
      .from('anthology_speakers')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('[GET /api/speakers/:id] Database error:', error);
      return errorResponse(res, ErrorCodes.DATABASE_ERROR, 'Failed to fetch speaker');
    }

    if (!data) {
      throw notFound('Speaker', id);
    }

    const speaker: ApiSpeaker = {
      id: data.id,
      anthologyId: data.anthology_id,
      conversationId: data.conversation_id,
      name: data.name,
      circleColor: data.circle_color,
      fadedCircleColor: data.faded_circle_color,
      quoteRectangleColor: data.quote_rectangle_color,
      fadedQuoteRectangleColor: data.faded_quote_rectangle_color,
      quoteTextColor: data.quote_text_color,
      fadedQuoteTextColor: data.faded_quote_text_color,
      createdAt: data.created_at,
    };

    return jsonResponse(res, speaker);
  } catch (error) {
    return handleError(res, error);
  }
}

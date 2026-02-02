/**
 * API endpoint: GET /api/conversations/:id/speakers
 * Get all speakers for a conversation
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../../_lib/supabase';
import { jsonResponse, handleError, errorResponse } from '../../_lib/response';
import { ConversationByIdSchema, safeParseQuery } from '../../_lib/validation';
import { ErrorCodes } from '../../_lib/errors';
import type { ApiSpeaker } from '../../../shared/types/api.types';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return errorResponse(res, ErrorCodes.METHOD_NOT_ALLOWED, 'Method not allowed', {
      allowedMethods: ['GET'],
    });
  }

  try {
    const parsed = safeParseQuery(ConversationByIdSchema, req.query);

    if (!parsed.success) {
      return errorResponse(res, ErrorCodes.VALIDATION_ERROR, 'Invalid parameters', {
        fieldErrors: parsed.error.flatten().fieldErrors,
      });
    }

    const { id } = parsed.data;

    const { data, error } = await supabase
      .from('anthology_speakers')
      .select('*')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[GET /api/conversations/:id/speakers] Database error:', error);
      return errorResponse(res, ErrorCodes.DATABASE_ERROR, 'Failed to fetch speakers');
    }

    const speakers: ApiSpeaker[] = (data || []).map((row: any) => ({
      id: row.id,
      anthologyId: row.anthology_id,
      conversationId: row.conversation_id,
      name: row.name,
      circleColor: row.circle_color,
      fadedCircleColor: row.faded_circle_color,
      quoteRectangleColor: row.quote_rectangle_color,
      fadedQuoteRectangleColor: row.faded_quote_rectangle_color,
      quoteTextColor: row.quote_text_color,
      fadedQuoteTextColor: row.faded_quote_text_color,
      createdAt: row.created_at,
    }));

    return jsonResponse(res, speakers);
  } catch (error) {
    return handleError(res, error);
  }
}

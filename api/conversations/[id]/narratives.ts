/**
 * API endpoint: GET /api/conversations/:id/narratives
 * Get all narratives for a conversation
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../../_lib/supabase';
import { jsonResponse, handleError, errorResponse } from '../../_lib/response';
import { ConversationByIdSchema, safeParseQuery } from '../../_lib/validation';
import { ErrorCodes } from '../../_lib/errors';
import type { ApiNarrative } from '../../../shared/types/api.types';

/**
 * Parse PostgreSQL vector string to number array
 */
function parseVectorString(embedding: unknown): number[] | undefined {
  if (!embedding) return undefined;

  if (Array.isArray(embedding)) {
    return embedding;
  }

  if (typeof embedding === 'string') {
    if (embedding.startsWith('[') && embedding.endsWith(']')) {
      try {
        return embedding
          .slice(1, -1)
          .split(',')
          .map((s) => parseFloat(s.trim()));
      } catch {
        return undefined;
      }
    }
  }

  return undefined;
}

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
      .from('anthology_narratives')
      .select('*')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[GET /api/conversations/:id/narratives] Database error:', error);
      return errorResponse(res, ErrorCodes.DATABASE_ERROR, 'Failed to fetch narratives');
    }

    const narratives: ApiNarrative[] = (data || []).map((row: any) => ({
      id: row.id,
      legacyId: row.legacy_id,
      anthologyId: row.anthology_id,
      conversationId: row.conversation_id,
      narrativeText: row.narrative_text,
      relatedResponses: [], // Will be populated by graph/load endpoint
      notes: row.notes,
      color: row.color,
      embedding: parseVectorString(row.embedding),
      createdAt: row.created_at,
    }));

    return jsonResponse(res, narratives);
  } catch (error) {
    return handleError(res, error);
  }
}

/**
 * API endpoint: GET /api/narratives
 * List narratives with optional filtering
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../_lib/supabase';
import { paginatedResponse, handleError, errorResponse } from '../_lib/response';
import { NarrativesQuerySchema, safeParseQuery } from '../_lib/validation';
import { ErrorCodes } from '../_lib/errors';
import type { ApiNarrative } from '../../shared/types/api.types';

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
    const parsed = safeParseQuery(NarrativesQuerySchema, req.query);

    if (!parsed.success) {
      return errorResponse(res, ErrorCodes.VALIDATION_ERROR, 'Invalid parameters', {
        fieldErrors: parsed.error.flatten().fieldErrors,
      });
    }

    const { limit, offset, conversationId, anthologyId } = parsed.data;

    let query = supabase
      .from('anthology_narratives')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: true })
      .range(offset, offset + limit - 1);

    if (conversationId) {
      query = query.eq('conversation_id', conversationId);
    }

    if (anthologyId) {
      query = query.eq('anthology_id', anthologyId);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('[GET /api/narratives] Database error:', error);
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

    return paginatedResponse(res, narratives, {
      total: count ?? 0,
      limit,
      offset,
      hasMore: offset + limit < (count ?? 0),
    });
  } catch (error) {
    return handleError(res, error);
  }
}

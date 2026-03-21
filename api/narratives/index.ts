/**
 * API endpoint: GET, POST /api/narratives
 * List narratives or create a new narrative
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../_lib/supabase';
import { paginatedResponse, createdResponse, handleError, errorResponse } from '../_lib/response';
import { NarrativesQuerySchema, CreateNarrativeSchema, safeParseQuery } from '../_lib/validation';
import { ErrorCodes, validationError, badRequest } from '../_lib/errors';
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

function rowToNarrative(row: any): ApiNarrative {
  return {
    id: row.id,
    legacyId: row.legacy_id,
    anthologyId: row.anthology_id,
    conversationId: row.conversation_id,
    narrativeText: row.narrative_text,
    relatedResponses: [],
    notes: row.notes,
    color: row.color,
    embedding: parseVectorString(row.embedding),
    createdAt: row.created_at,
  };
}

async function handleGet(req: VercelRequest, res: VercelResponse) {
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

  return paginatedResponse(res, (data || []).map(rowToNarrative), {
    total: count ?? 0,
    limit,
    offset,
    hasMore: offset + limit < (count ?? 0),
  });
}

async function handlePost(req: VercelRequest, res: VercelResponse) {
  const parsed = CreateNarrativeSchema.safeParse(req.body);

  if (!parsed.success) {
    throw validationError('Invalid request body', parsed.error.flatten().fieldErrors);
  }

  const { conversationId, narrativeText, notes } = parsed.data;

  // Verify conversation exists and get anthology_id
  const { data: conversation, error: convError } = await supabase
    .from('anthology_conversations')
    .select('anthology_id')
    .eq('id', conversationId)
    .maybeSingle();

  if (convError || !conversation) {
    throw badRequest('Conversation not found');
  }

  const { data, error } = await supabase
    .from('anthology_narratives')
    .insert({
      anthology_id: conversation.anthology_id,
      conversation_id: conversationId,
      narrative_text: narrativeText,
      notes: notes ?? null,
    })
    .select()
    .single();

  if (error) {
    console.error('[POST /api/narratives] Database error:', error);
    return errorResponse(res, ErrorCodes.DATABASE_ERROR, 'Failed to create narrative');
  }

  return createdResponse(res, rowToNarrative(data));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    switch (req.method) {
      case 'GET':
        return handleGet(req, res);
      case 'POST':
        return handlePost(req, res);
      default:
        return errorResponse(res, ErrorCodes.METHOD_NOT_ALLOWED, 'Method not allowed', {
          allowedMethods: ['GET', 'POST'],
        });
    }
  } catch (error) {
    return handleError(res, error);
  }
}

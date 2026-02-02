/**
 * API endpoint: GET /api/anthologies
 * List all public anthologies
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../_lib/supabase';
import { paginatedResponse, handleError, errorResponse } from '../_lib/response';
import { AnthologiesQuerySchema, safeParseQuery } from '../_lib/validation';
import { ErrorCodes } from '../_lib/errors';
import type { ApiAnthology } from '../../shared/types/api.types';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return errorResponse(res, ErrorCodes.METHOD_NOT_ALLOWED, 'Method not allowed', {
      allowedMethods: ['GET'],
    });
  }

  try {
    const parsed = safeParseQuery(AnthologiesQuerySchema, req.query);

    if (!parsed.success) {
      return errorResponse(res, ErrorCodes.VALIDATION_ERROR, 'Invalid parameters', {
        fieldErrors: parsed.error.flatten().fieldErrors,
      });
    }

    const { limit, offset, publicOnly } = parsed.data;

    let query = supabase
      .from('anthology_anthologies')
      .select('id, slug, title, description, is_public, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (publicOnly) {
      query = query.eq('is_public', true);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('[GET /api/anthologies] Database error:', error);
      return errorResponse(res, ErrorCodes.DATABASE_ERROR, 'Failed to fetch anthologies');
    }

    const anthologies: ApiAnthology[] = (data || []).map((row: any) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      description: row.description,
      isPublic: row.is_public,
      createdAt: row.created_at,
    }));

    return paginatedResponse(res, anthologies, {
      total: count ?? 0,
      limit,
      offset,
      hasMore: offset + limit < (count ?? 0),
    });
  } catch (error) {
    return handleError(res, error);
  }
}

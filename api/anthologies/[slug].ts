/**
 * API endpoint: GET /api/anthologies/:slug
 * Get a single anthology by slug
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../_lib/supabase';
import { jsonResponse, handleError, errorResponse } from '../_lib/response';
import { AnthologyBySlugSchema, safeParseQuery } from '../_lib/validation';
import { ErrorCodes, notFound } from '../_lib/errors';
import type { ApiAnthology } from '../../shared/types/api.types';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return errorResponse(res, ErrorCodes.METHOD_NOT_ALLOWED, 'Method not allowed', {
      allowedMethods: ['GET'],
    });
  }

  try {
    const parsed = safeParseQuery(AnthologyBySlugSchema, req.query);

    if (!parsed.success) {
      return errorResponse(res, ErrorCodes.VALIDATION_ERROR, 'Invalid parameters', {
        fieldErrors: parsed.error.flatten().fieldErrors,
      });
    }

    const { slug } = parsed.data;

    const { data, error } = await supabase
      .from('anthology_anthologies')
      .select('id, slug, title, description, is_public, created_at')
      .eq('slug', slug)
      .maybeSingle();

    if (error) {
      console.error('[GET /api/anthologies/:slug] Database error:', error);
      return errorResponse(res, ErrorCodes.DATABASE_ERROR, 'Failed to fetch anthology');
    }

    if (!data) {
      throw notFound('Anthology', slug);
    }

    const anthology: ApiAnthology = {
      id: data.id,
      slug: data.slug,
      title: data.title,
      description: data.description,
      isPublic: data.is_public,
      createdAt: data.created_at,
    };

    return jsonResponse(res, anthology);
  } catch (error) {
    return handleError(res, error);
  }
}

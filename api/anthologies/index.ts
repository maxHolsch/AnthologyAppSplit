/**
 * API endpoint: GET, POST /api/anthologies
 * List anthologies or create a new one
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../_lib/supabase';
import {
  paginatedResponse,
  createdResponse,
  handleError,
  errorResponse,
} from '../_lib/response';
import {
  AnthologiesQuerySchema,
  CreateAnthologySchema,
  safeParseQuery,
} from '../_lib/validation';
import { ErrorCodes, validationError } from '../_lib/errors';
import type { ApiAnthology } from '../../shared/types/api.types';

/**
 * Simple slug generator: lowercase, replace non-alphanumeric with hyphens, collapse runs.
 */
function toSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function handleGet(req: VercelRequest, res: VercelResponse) {
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
}

async function handlePost(req: VercelRequest, res: VercelResponse) {
  const parsed = CreateAnthologySchema.safeParse(req.body);
  if (!parsed.success) {
    throw validationError('Invalid request body', parsed.error.flatten().fieldErrors);
  }

  const { title, slug: requestedSlug } = parsed.data;
  let slug = requestedSlug || toSlug(title);

  // Try inserting; on slug collision append timestamp
  const insert = (s: string) =>
    supabase
      .from('anthology_anthologies')
      .insert({
        slug: s,
        title,
        is_public: false,
        metadata: { source: 'api', created_at: new Date().toISOString() },
      })
      .select('id, slug, title, is_public, created_at')
      .single();

  let { data, error } = await insert(slug);

  if (error) {
    // Slug collision — retry with timestamp suffix
    slug = `${slug}-${Date.now()}`;
    const retry = await insert(slug);
    data = retry.data;
    error = retry.error;
  }

  if (error || !data) {
    console.error('[POST /api/anthologies] Database error:', error);
    return errorResponse(res, ErrorCodes.DATABASE_ERROR, 'Failed to create anthology');
  }

  const anthology: ApiAnthology = {
    id: data.id,
    slug: data.slug,
    title: data.title,
    description: null,
    isPublic: data.is_public,
    createdAt: data.created_at,
  };

  return createdResponse(res, anthology);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    switch (req.method) {
      case 'GET':
        return await handleGet(req, res);
      case 'POST':
        return await handlePost(req, res);
      default:
        return errorResponse(res, ErrorCodes.METHOD_NOT_ALLOWED, 'Method not allowed', {
          allowedMethods: ['GET', 'POST'],
        });
    }
  } catch (error) {
    return handleError(res, error);
  }
}

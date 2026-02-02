/**
 * API endpoint: GET, POST /api/speakers
 * List speakers or create a new speaker
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../_lib/supabase';
import {
  paginatedResponse,
  createdResponse,
  handleError,
  errorResponse,
} from '../_lib/response';
import { SpeakersQuerySchema, CreateSpeakerSchema, safeParseQuery } from '../_lib/validation';
import { ErrorCodes, validationError, badRequest } from '../_lib/errors';
import { requireAuth } from '../_lib/auth';
import type { ApiSpeaker } from '../../shared/types/api.types';

/**
 * Default speaker color palette
 */
const DEFAULT_PALETTE = [
  '#E5C39E',
  '#9EBEDF',
  '#E5B3B3',
  '#B3E5D1',
  '#D9B3E5',
  '#E5D9B3',
  '#B3D9E5',
  '#E5B3D9',
];

/**
 * Build speaker color scheme from base color
 */
function buildSpeakerColorScheme(baseColor: string) {
  // Simple color scheme generation
  // In production, you'd want to use a proper color manipulation library
  return {
    circle_color: baseColor,
    faded_circle_color: `${baseColor}80`, // 50% opacity
    quote_rectangle_color: `${baseColor}33`, // 20% opacity
    faded_quote_rectangle_color: `${baseColor}1A`, // 10% opacity
    quote_text_color: '#1a1a1a',
    faded_quote_text_color: '#1a1a1a80',
  };
}

async function handleGet(req: VercelRequest, res: VercelResponse) {
  const parsed = safeParseQuery(SpeakersQuerySchema, req.query);

  if (!parsed.success) {
    return errorResponse(res, ErrorCodes.VALIDATION_ERROR, 'Invalid parameters', {
      fieldErrors: parsed.error.flatten().fieldErrors,
    });
  }

  const { limit, offset, conversationId, anthologyId } = parsed.data;

  let query = supabase
    .from('anthology_speakers')
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
    console.error('[GET /api/speakers] Database error:', error);
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

  return paginatedResponse(res, speakers, {
    total: count ?? 0,
    limit,
    offset,
    hasMore: offset + limit < (count ?? 0),
  });
}

async function handlePost(req: VercelRequest, res: VercelResponse) {
  // Require authentication for creating speakers
  await requireAuth(req);

  const parsed = CreateSpeakerSchema.safeParse(req.body);

  if (!parsed.success) {
    throw validationError('Invalid request body', parsed.error.flatten().fieldErrors);
  }

  const {
    conversationId,
    name,
    circleColor,
    fadedCircleColor,
    quoteRectangleColor,
    fadedQuoteRectangleColor,
    quoteTextColor,
    fadedQuoteTextColor,
  } = parsed.data;

  // Get the conversation to find the anthology_id
  const { data: conversation, error: convError } = await supabase
    .from('anthology_conversations')
    .select('anthology_id')
    .eq('id', conversationId)
    .maybeSingle();

  if (convError || !conversation) {
    throw badRequest('Conversation not found');
  }

  // Check if speaker already exists for this conversation
  const { data: existing } = await supabase
    .from('anthology_speakers')
    .select('id')
    .eq('conversation_id', conversationId)
    .eq('name', name)
    .maybeSingle();

  if (existing) {
    throw badRequest('Speaker with this name already exists in this conversation');
  }

  // Count existing speakers to choose a color if not provided
  let colors;
  if (circleColor) {
    colors = {
      circle_color: circleColor,
      faded_circle_color: fadedCircleColor || `${circleColor}80`,
      quote_rectangle_color: quoteRectangleColor || `${circleColor}33`,
      faded_quote_rectangle_color: fadedQuoteRectangleColor || `${circleColor}1A`,
      quote_text_color: quoteTextColor || '#1a1a1a',
      faded_quote_text_color: fadedQuoteTextColor || '#1a1a1a80',
    };
  } else {
    const { data: allSpeakers } = await supabase
      .from('anthology_speakers')
      .select('id')
      .eq('anthology_id', conversation.anthology_id)
      .eq('conversation_id', conversationId);

    const index = allSpeakers?.length ?? 0;
    const baseColor = DEFAULT_PALETTE[index % DEFAULT_PALETTE.length];
    colors = buildSpeakerColorScheme(baseColor);
  }

  const { data, error } = await supabase
    .from('anthology_speakers')
    .insert({
      anthology_id: conversation.anthology_id,
      conversation_id: conversationId,
      name,
      ...colors,
    })
    .select()
    .single();

  if (error) {
    console.error('[POST /api/speakers] Database error:', error);
    return errorResponse(res, ErrorCodes.DATABASE_ERROR, 'Failed to create speaker');
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

  return createdResponse(res, speaker);
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

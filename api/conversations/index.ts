/**
 * API endpoint: GET /api/conversations
 * List conversations with optional filtering by anthology
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../_lib/supabase';
import { paginatedResponse, handleError, errorResponse } from '../_lib/response';
import { ConversationsQuerySchema, safeParseQuery } from '../_lib/validation';
import { ErrorCodes } from '../_lib/errors';
import type { ApiConversation } from '../../shared/types/api.types';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return errorResponse(res, ErrorCodes.METHOD_NOT_ALLOWED, 'Method not allowed', {
      allowedMethods: ['GET'],
    });
  }

  try {
    const parsed = safeParseQuery(ConversationsQuerySchema, req.query);

    if (!parsed.success) {
      return errorResponse(res, ErrorCodes.VALIDATION_ERROR, 'Invalid parameters', {
        fieldErrors: parsed.error.flatten().fieldErrors,
      });
    }

    const { limit, offset, anthologyId } = parsed.data;

    let query = supabase
      .from('anthology_conversations')
      .select(
        `
        id,
        legacy_id,
        anthology_id,
        title,
        date,
        color,
        participants,
        location,
        facilitator,
        topics,
        source_transcript,
        metadata,
        created_at,
        anthology_conversation_recordings!inner (
          is_primary,
          recording_id,
          anthology_recordings (
            file_path,
            duration_ms
          )
        )
      `,
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (anthologyId) {
      query = query.eq('anthology_id', anthologyId);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('[GET /api/conversations] Database error:', error);
      return errorResponse(res, ErrorCodes.DATABASE_ERROR, 'Failed to fetch conversations');
    }

    const conversations: ApiConversation[] = (data || []).map((row: any) => {
      const primaryRecordingLink = row.anthology_conversation_recordings?.find(
        (cr: any) => cr.is_primary
      );
      const primaryRecording = primaryRecordingLink?.anthology_recordings;

      return {
        id: row.id,
        legacyId: row.legacy_id,
        anthologyId: row.anthology_id,
        audioFile: primaryRecording?.file_path || '',
        duration: primaryRecording?.duration_ms || 0,
        color: row.color,
        metadata: {
          title: row.title,
          date: row.date || '',
          participants: row.participants || [],
          speakerColors: row.metadata?.speaker_colors,
          location: row.location,
          facilitator: row.facilitator,
          topics: row.topics || [],
          sourceTranscript: row.source_transcript,
          ...row.metadata,
        },
        createdAt: row.created_at,
      };
    });

    return paginatedResponse(res, conversations, {
      total: count ?? 0,
      limit,
      offset,
      hasMore: offset + limit < (count ?? 0),
    });
  } catch (error) {
    return handleError(res, error);
  }
}

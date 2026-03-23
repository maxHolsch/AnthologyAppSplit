/**
 * API endpoint: GET /api/conversations/:id
 * Get a single conversation by ID
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase, getConversationsBucket } from '../_lib/supabase';
import { jsonResponse, handleError, errorResponse } from '../_lib/response';
import { ConversationByIdSchema, safeParseQuery } from '../_lib/validation';
import { ErrorCodes, notFound } from '../_lib/errors';
import type { ApiConversation } from '../../shared/types/api.types';

const SIGNED_URL_TTL_SECONDS = 60 * 60;

async function createSignedStorageUrl(bucket: string, objectPath: string | null | undefined) {
  if (!objectPath) return null;

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(objectPath, SIGNED_URL_TTL_SECONDS);

  if (error) {
    console.warn('[GET /api/conversations/:id] Failed to create signed URL:', { bucket, objectPath, error: error.message });
    return null;
  }

  return data?.signedUrl ?? null;
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
        anthology_conversation_recordings (
          is_primary,
          recording_id,
          anthology_recordings (
            file_path,
            duration_ms
          )
        )
      `
      )
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('[GET /api/conversations/:id] Database error:', error);
      return errorResponse(res, ErrorCodes.DATABASE_ERROR, 'Failed to fetch conversation');
    }

    if (!data) {
      throw notFound('Conversation', id);
    }

    const primaryRecordingLink = data.anthology_conversation_recordings?.find(
      (cr: any) => cr.is_primary
    );
    const primaryRecording = primaryRecordingLink?.anthology_recordings;
    const metadata = (data.metadata || {}) as Record<string, unknown>;
    const bucket = typeof metadata.bucket === 'string' ? metadata.bucket : getConversationsBucket();
    const assignedQuestionsPath = typeof metadata.assigned_questions_path === 'string' ? metadata.assigned_questions_path : null;
    const assignedNarrativesPath = typeof metadata.assigned_narratives_path === 'string' ? metadata.assigned_narratives_path : null;
    const filteredTurnsPath = typeof metadata.filtered_turns_path === 'string' ? metadata.filtered_turns_path : null;
    const createdResponsesPath = typeof metadata.create_responses_path === 'string' ? metadata.create_responses_path : null;
    const chronologicalOrderPath = typeof metadata.set_chronological_order_path === 'string' ? metadata.set_chronological_order_path : null;

    const [
      assignedQuestionsFilePath,
      assignedNarrativesFilePath,
      filteredTurnsFilePath,
      createdResponsesFilePath,
      chronologicalOrderFilePath,
    ] = await Promise.all([
      createSignedStorageUrl(bucket, assignedQuestionsPath),
      createSignedStorageUrl(bucket, assignedNarrativesPath),
      createSignedStorageUrl(bucket, filteredTurnsPath),
      createSignedStorageUrl(bucket, createdResponsesPath),
      createSignedStorageUrl(bucket, chronologicalOrderPath),
    ]);

    const conversation: ApiConversation = {
      id: data.id,
      legacyId: data.legacy_id,
      anthologyId: data.anthology_id,
      audioFile: primaryRecording?.file_path || '',
      duration: primaryRecording?.duration_ms || 0,
      color: data.color,
      metadata: {
        title: data.title,
        date: data.date || '',
        participants: data.participants || [],
        speakerColors: data.metadata?.speaker_colors,
        location: data.location,
        facilitator: data.facilitator,
        topics: data.topics || [],
        sourceTranscript: data.source_transcript,
        ...data.metadata,
      },
      assignedQuestionsFilePath,
      assignedNarrativesFilePath,
      filteredTurnsFilePath,
      createdResponsesFilePath,
      chronologicalOrderFilePath,
      createdAt: data.created_at,
    };

    return jsonResponse(res, conversation);
  } catch (error) {
    return handleError(res, error);
  }
}

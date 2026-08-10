/**
 * API endpoint: GET /api/recordings
 * List recordings with optional filtering by anthology
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase, getConversationsBucket } from '../_lib/supabase';
import { paginatedResponse, handleError, errorResponse } from '../_lib/response';
import { RecordingsQuerySchema, safeParseQuery } from '../_lib/validation';
import { ErrorCodes } from '../_lib/errors';
import type { ApiRecording } from '../../shared/types/api.types';

const SIGNED_URL_TTL_SECONDS = 60 * 60;

async function createSignedStorageUrl(bucket: string, objectPath: string | null | undefined) {
  if (!objectPath) return null;

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(objectPath, SIGNED_URL_TTL_SECONDS);

  if (error) {
    console.warn('[GET /api/recordings] Failed to create signed URL:', { bucket, objectPath, error: error.message });
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
    const parsed = safeParseQuery(RecordingsQuerySchema, req.query);

    if (!parsed.success) {
      return errorResponse(res, ErrorCodes.VALIDATION_ERROR, 'Invalid parameters', {
        fieldErrors: parsed.error.flatten().fieldErrors,
      });
    }

    const { limit, offset, anthologyId } = parsed.data;

    let query = supabase
      .from('anthology_recordings')
      .select(
        'id, anthology_id, file_path, file_name, file_size_bytes, mime_type, duration_ms, sample_rate, bit_rate, metadata, created_at',
        { count: 'exact' },
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (anthologyId) {
      query = query.eq('anthology_id', anthologyId);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('[GET /api/recordings] Database error:', error);
      return errorResponse(res, ErrorCodes.DATABASE_ERROR, 'Failed to fetch recordings');
    }

    const recordings: ApiRecording[] = await Promise.all((data || []).map(async (row: any) => {
      const metadata = (row.metadata || {}) as Record<string, unknown>;
      const bucket = typeof metadata.bucket === 'string' ? metadata.bucket : getConversationsBucket();
      const transcriptPath =
        typeof metadata.transcript_path === 'string' ? metadata.transcript_path : null;
      const mergedTurnsPath =
        typeof metadata.merged_turns_path === 'string' ? metadata.merged_turns_path : null;
      const speakerMapPath =
        typeof metadata.speaker_map_path === 'string' ? metadata.speaker_map_path : null;

      const [filePath, transcriptFilePath, mergedTurnsFilePath, speakerMapFilePath] = await Promise.all([
        createSignedStorageUrl(bucket, row.file_path),
        createSignedStorageUrl(bucket, transcriptPath),
        createSignedStorageUrl(bucket, mergedTurnsPath),
        createSignedStorageUrl(bucket, speakerMapPath),
      ]);

      return {
        id: row.id,
        anthologyId: row.anthology_id,
        filePath: filePath ?? row.file_path,
        transcriptFilePath,
        mergedTurnsFilePath,
        speakerMapFilePath,
        fileName: row.file_name,
        fileSizeBytes: row.file_size_bytes,
        mimeType: row.mime_type,
        durationMs: row.duration_ms,
        sampleRate: row.sample_rate,
        bitRate: row.bit_rate,
        metadata,
        createdAt: row.created_at,
      };
    }));

    return paginatedResponse(res, recordings, {
      total: count ?? 0,
      limit,
      offset,
      hasMore: offset + limit < (count ?? 0),
    });
  } catch (error) {
    return handleError(res, error);
  }
}

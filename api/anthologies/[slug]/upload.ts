/**
 * API endpoint: POST /api/anthologies/:slug/upload
 * Upload a conversation file to the anthology's storage folder.
 *
 * The file is sent as the raw request body (not multipart).
 * Required headers:
 *   x-filename — original filename (e.g. "interview.mp3")
 *   content-type — MIME type of the file
 *
 * Returns the storage path and a short-lived signed URL that can be
 * passed to POST /api/transcribe for transcription.
 */

import path from 'path';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase, getConversationsBucket } from '../../_lib/supabase';
import { createdResponse, handleError, errorResponse } from '../../_lib/response';
import { ErrorCodes, notFound, badRequest } from '../../_lib/errors';

/** Derive MIME type from filename extension (covers common audio/video formats). */
const MIME_BY_EXT: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.m4a': 'audio/mp4',
  '.mov': 'video/quicktime',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.webm': 'video/webm',
  '.flac': 'audio/flac',
  '.aac': 'audio/aac',
  '.wma': 'audio/x-ms-wma',
  '.aiff': 'audio/aiff',
  '.aif': 'audio/aiff',
};

function mimeFromFileName(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  return MIME_BY_EXT[ext] || 'application/octet-stream';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return errorResponse(res, ErrorCodes.METHOD_NOT_ALLOWED, 'Method not allowed', {
      allowedMethods: ['POST'],
    });
  }

  try {
    const slug = req.query.slug as string;
    if (!slug) {
      throw badRequest('Missing anthology slug in URL path');
    }

    // Verify the anthology exists
    const { data: anthology, error: lookupErr } = await supabase
      .from('anthology_anthologies')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();

    if (lookupErr) {
      console.error('[POST /api/anthologies/:slug/upload] DB error:', lookupErr);
      return errorResponse(res, ErrorCodes.DATABASE_ERROR, 'Failed to look up anthology');
    }
    if (!anthology) {
      throw notFound('Anthology', slug);
    }

    // Extract filename from header
    const fileName = req.headers['x-filename'] as string | undefined;
    if (!fileName) {
      throw badRequest('Missing x-filename header');
    }

    // Get file body as Buffer
    const body: Buffer = Buffer.isBuffer(req.body)
      ? req.body
      : typeof req.body === 'string'
        ? Buffer.from(req.body)
        : Buffer.from(JSON.stringify(req.body));

    if (!body.length) {
      throw badRequest('Empty file body');
    }

    const contentType = mimeFromFileName(fileName);
    const bucket = getConversationsBucket();
    const objectPath = `upload_conversations/${slug}/${Date.now()}_${fileName}`;

    const { error: uploadErr } = await supabase.storage
      .from(bucket)
      .upload(objectPath, body, {
        contentType,
        upsert: false,
      });

    if (uploadErr) {
      console.error('[POST /api/anthologies/:slug/upload] Storage error:', uploadErr);
      return errorResponse(res, ErrorCodes.DATABASE_ERROR, `Storage upload failed: ${uploadErr.message}`);
    }

    // Create a recording row so GET /api/recordings?anthologyId=... can find it
    const { data: recording, error: recErr } = await supabase
      .from('anthology_recordings')
      .insert({
        anthology_id: anthology.id,
        file_path: objectPath,
        file_name: fileName,
        file_size_bytes: body.length,
        mime_type: contentType,
        duration_ms: 1,  // Placeholder; updated with real duration after transcription
        metadata: { source: 'upload', bucket, object_path: objectPath },
      })
      .select('id')
      .single();

    if (recErr) {
      console.error('[POST /api/anthologies/:slug/upload] Recording insert error:', recErr);
      return errorResponse(res, ErrorCodes.DATABASE_ERROR, 'File uploaded but failed to create recording row');
    }

    // Generate a signed URL (valid for 1 hour) so the caller can pass it to /api/transcribe
    const { data: signedData } = await supabase.storage
      .from(bucket)
      .createSignedUrl(objectPath, 3600);

    return createdResponse(res, {
      recordingId: recording.id,
      anthologyId: anthology.id,
      fileName,
      path: objectPath,
      bucket,
      signedUrl: signedData?.signedUrl ?? null,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

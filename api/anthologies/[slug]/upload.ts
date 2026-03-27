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
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { request: undiciRequest } = require('undici') as typeof import('undici');
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

    // Get file body as Buffer.
    // Vercel may have already parsed the body for small/JSON payloads, but binary
    // uploads often arrive as a raw stream with req.body === undefined.
    let body: Buffer;
    if (Buffer.isBuffer(req.body)) {
      body = req.body;
    } else if (typeof req.body === 'string') {
      body = Buffer.from(req.body);
    } else {
      // Read the raw request stream (handles binary file uploads)
      body = await new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];
        req.on('data', (chunk: unknown) =>
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string))
        );
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
      });
    }

    if (!body.length) {
      throw badRequest('Empty file body');
    }

    const fileSizeMb = (body.length / 1024 / 1024).toFixed(2);
    const contentType = mimeFromFileName(fileName);
    const bucket = getConversationsBucket();
    const objectPath = `upload_conversations/${slug}/${Date.now()}_${fileName}`;

    console.log(`[POST /api/anthologies/:slug/upload] Uploading ${fileName} (${fileSizeMb} MB) → ${bucket}/${objectPath}`);

    // Use undici's request() instead of the Supabase SDK fetch() for the storage upload.
    // The built-in fetch (undici) throws UND_ERR_SOCKET and swallows the real HTTP error
    // when the server closes the connection before the full body is sent. undici's
    // lower-level request() API reads the response correctly in that case.
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
    const encodedPath = objectPath.split('/').map(encodeURIComponent).join('/');
    const storageUrl = `${supabaseUrl}/storage/v1/object/${bucket}/${encodedPath}`;

    const { statusCode, body: responseBody } = await undiciRequest(storageUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': contentType,
        'x-upsert': 'false',
      },
      body,
    });

    if (statusCode !== 200) {
      const responseText = await responseBody.text();
      console.error(`[POST /api/anthologies/:slug/upload] Storage rejected (${statusCode}, ${fileSizeMb} MB):`, responseText);
      return errorResponse(res, ErrorCodes.DATABASE_ERROR, `Storage upload failed (HTTP ${statusCode}): ${responseText}`);
    }

    // Consume response body to free the connection
    await responseBody.dump();

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

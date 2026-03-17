/**
 * Integration tests for POST /api/anthologies/:slug/upload
 *
 * These tests hit the REAL Supabase instance configured in .env.
 * They create an anthology, upload a file to storage, and clean up afterward.
 *
 * Run with:  npm run test:integration
 */

// .env is loaded by tests/integration/setup.ts (vitest setupFiles)

import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { mockReq, mockRes } from '../api/_helpers';
import anthologiesHandler from '../../api/anthologies/index';
import uploadHandler from '../../api/anthologies/[slug]/upload';
import recordingsHandler from '../../api/recordings/index';
import { supabase, getConversationsBucket } from '../../api/_lib/supabase';

// Track resources for cleanup
const createdAnthologyIds: string[] = [];
const createdRecordingIds: string[] = [];
const uploadedObjects: { bucket: string; path: string }[] = [];

let testSlug: string;
let testAnthologyId: string;

beforeAll(async () => {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error(
      'Integration tests require SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env'
    );
  }

  const bucket = getConversationsBucket();
  console.log(
    `[integration:upload] schema=${process.env.SUPABASE_DB_SCHEMA || 'public'}, bucket=${bucket}`
  );

  // Create a test anthology to upload files into
  const title = `Upload Test ${Date.now()}`;
  const req = mockReq({ method: 'POST', body: { title } });
  const mock = mockRes();
  await anthologiesHandler(req, mock.res);

  if (mock.statusCode !== 201) {
    throw new Error(`Failed to create test anthology: ${JSON.stringify(mock.body)}`);
  }

  testAnthologyId = mock.body.data.id;
  testSlug = mock.body.data.slug;
  createdAnthologyIds.push(testAnthologyId);
  console.log(`[integration:upload] created test anthology: ${testSlug} (${testAnthologyId})`);
});

afterAll(async () => {
  // Clean up uploaded files
  for (const obj of uploadedObjects) {
    const { error } = await supabase.storage.from(obj.bucket).remove([obj.path]);
    if (error) {
      console.warn(`[integration:upload] cleanup warning — could not delete ${obj.path}:`, error.message);
    }
  }
  if (uploadedObjects.length > 0) {
    console.log(`[integration:upload] cleaned up ${uploadedObjects.length} uploaded file(s)`);
  }

  // Clean up recordings (before anthologies, due to foreign key)
  if (createdRecordingIds.length > 0) {
    const { error } = await supabase
      .from('anthology_recordings')
      .delete()
      .in('id', createdRecordingIds);
    if (error) {
      console.warn('[integration:upload] cleanup warning — could not delete test recordings:', error.message);
    } else {
      console.log(`[integration:upload] cleaned up ${createdRecordingIds.length} test recording(s)`);
    }
  }

  // Clean up anthologies
  if (createdAnthologyIds.length > 0) {
    const { error } = await supabase
      .from('anthology_anthologies')
      .delete()
      .in('id', createdAnthologyIds);
    if (error) {
      console.warn('[integration:upload] cleanup warning — could not delete test anthologies:', error.message);
    } else {
      console.log(`[integration:upload] cleaned up ${createdAnthologyIds.length} test anthology(ies)`);
    }
  }
});

describe('POST /api/anthologies/:slug/upload (integration)', () => {
  it('uploads a file and returns path + signed URL', async () => {
    const fileContent = 'Hello, this is a test audio file (not really).';
    const fileName = 'test-recording.txt';

    const req = mockReq({
      method: 'POST',
      query: { slug: testSlug },
      headers: {
        'x-filename': fileName,
        'content-type': 'text/plain',
      },
      body: Buffer.from(fileContent),
    });
    const mock = mockRes();

    await uploadHandler(req, mock.res);

    expect(mock.statusCode).toBe(201);
    expect(mock.body.data).toBeDefined();
    expect(mock.body.data.recordingId).toBeTruthy();
    expect(mock.body.data.anthologyId).toBe(testAnthologyId);
    expect(mock.body.data.fileName).toBe(fileName);
    expect(mock.body.data.path).toContain(testSlug);
    expect(mock.body.data.path).toContain(fileName);
    expect(mock.body.data.bucket).toBe(getConversationsBucket());
    expect(mock.body.data.signedUrl).toBeTruthy();

    // Track for cleanup
    createdRecordingIds.push(mock.body.data.recordingId);
    uploadedObjects.push({ bucket: mock.body.data.bucket, path: mock.body.data.path });
  });

  it('uploaded file exists in storage', async () => {
    const fileContent = 'Verify this file exists in storage.';
    const fileName = 'verify-exists.txt';

    const req = mockReq({
      method: 'POST',
      query: { slug: testSlug },
      headers: {
        'x-filename': fileName,
        'content-type': 'text/plain',
      },
      body: Buffer.from(fileContent),
    });
    const mock = mockRes();

    await uploadHandler(req, mock.res);
    expect(mock.statusCode).toBe(201);

    const objectPath = mock.body.data.path;
    createdRecordingIds.push(mock.body.data.recordingId);
    uploadedObjects.push({ bucket: mock.body.data.bucket, path: objectPath });

    // Download the file and verify contents
    const bucket = getConversationsBucket();
    const { data, error } = await supabase.storage.from(bucket).download(objectPath);

    expect(error).toBeNull();
    expect(data).toBeDefined();
    const text = await data!.text();
    expect(text).toBe(fileContent);
  });

  it('uploaded recording is returned by GET /recordings?anthologyId=...', async () => {
    const fileContent = 'Recording that should appear in GET /recordings.';
    const fileName = 'queryable-recording.txt';

    // Upload a file
    const uploadReq = mockReq({
      method: 'POST',
      query: { slug: testSlug },
      headers: {
        'x-filename': fileName,
        'content-type': 'text/plain',
      },
      body: Buffer.from(fileContent),
    });
    const uploadMock = mockRes();
    await uploadHandler(uploadReq, uploadMock.res);

    expect(uploadMock.statusCode).toBe(201);
    const recordingId = uploadMock.body.data.recordingId;
    createdRecordingIds.push(recordingId);
    uploadedObjects.push({ bucket: uploadMock.body.data.bucket, path: uploadMock.body.data.path });

    // Query recordings for this anthology
    const getReq = mockReq({
      method: 'GET',
      query: { anthologyId: testAnthologyId },
    });
    const getMock = mockRes();
    await recordingsHandler(getReq, getMock.res);

    expect(getMock.statusCode).toBe(200);
    expect(getMock.body.data.length).toBeGreaterThan(0);

    const found = getMock.body.data.find((r: any) => r.id === recordingId);
    expect(found).toBeDefined();
    expect(found.fileName).toBe(fileName);
    expect(found.anthologyId).toBe(testAnthologyId);
    expect(found.mimeType).toBe('application/octet-stream'); // .txt not in MIME map
    expect(found.fileSizeBytes).toBe(fileContent.length);
  });

  it('derives mime_type from filename extension', async () => {
    const fileName = 'interview.mp3';
    const req = mockReq({
      method: 'POST',
      query: { slug: testSlug },
      headers: {
        'x-filename': fileName,
        'content-type': 'multipart/form-data; boundary=----fake', // wrong header
      },
      body: Buffer.from('fake mp3 content'),
    });
    const mock = mockRes();

    await uploadHandler(req, mock.res);

    expect(mock.statusCode).toBe(201);
    createdRecordingIds.push(mock.body.data.recordingId);
    uploadedObjects.push({ bucket: mock.body.data.bucket, path: mock.body.data.path });

    // Verify the recording row has the correct MIME type from the extension
    const { data } = await supabase
      .from('anthology_recordings')
      .select('mime_type')
      .eq('id', mock.body.data.recordingId)
      .single();

    expect(data!.mime_type).toBe('audio/mpeg');
  });

  it('returns 404 for non-existent anthology slug', async () => {
    const req = mockReq({
      method: 'POST',
      query: { slug: 'does-not-exist-99999' },
      headers: {
        'x-filename': 'test.txt',
        'content-type': 'text/plain',
      },
      body: Buffer.from('some content'),
    });
    const mock = mockRes();

    await uploadHandler(req, mock.res);

    expect(mock.statusCode).toBe(404);
    expect(mock.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 400 when x-filename header is missing', async () => {
    const req = mockReq({
      method: 'POST',
      query: { slug: testSlug },
      headers: {
        'content-type': 'text/plain',
      },
      body: Buffer.from('some content'),
    });
    const mock = mockRes();

    await uploadHandler(req, mock.res);

    expect(mock.statusCode).toBe(400);
    expect(mock.body.error.code).toBe('BAD_REQUEST');
  });

  it('returns 400 when body is empty', async () => {
    const req = mockReq({
      method: 'POST',
      query: { slug: testSlug },
      headers: {
        'x-filename': 'empty.txt',
        'content-type': 'text/plain',
      },
      body: Buffer.alloc(0),
    });
    const mock = mockRes();

    await uploadHandler(req, mock.res);

    expect(mock.statusCode).toBe(400);
    expect(mock.body.error.code).toBe('BAD_REQUEST');
  });

  it('returns 405 for non-POST methods', async () => {
    const req = mockReq({
      method: 'GET',
      query: { slug: testSlug },
    });
    const mock = mockRes();

    await uploadHandler(req, mock.res);

    expect(mock.statusCode).toBe(405);
    expect(mock.body.error.code).toBe('METHOD_NOT_ALLOWED');
  });
});

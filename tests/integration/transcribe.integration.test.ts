/**
 * Integration tests for the async transcribe endpoints:
 *   POST /api/transcribe         — start transcription
 *   GET  /api/transcribe/status  — check status
 *   POST /api/transcribe/tick    — advance job
 *
 * These tests hit the REAL Supabase instance configured in .env.
 * Tests that call AssemblyAI are skipped when ASSEMBLYAI_API_KEY is missing.
 *
 * Run with:  npm run test:integration
 */

// .env is loaded by tests/integration/setup.ts (vitest setupFiles)

import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { mockReq, mockRes } from '../api/_helpers';
import anthologiesHandler from '../../api/anthologies/index';
import uploadHandler from '../../api/anthologies/[slug]/upload';
import transcribeHandler from '../../api/transcribe';
import transcribeStatusHandler from '../../api/transcribe/status';
import transcribeTickHandler from '../../api/transcribe/tick';
import { supabase, getConversationsBucket } from '../../api/_lib/supabase';

// ── Track resources for cleanup ──
const createdAnthologyIds: string[] = [];
const createdRecordingIds: string[] = [];
const uploadedObjects: { bucket: string; path: string }[] = [];

let testSlug: string;
let testAnthologyId: string;
let testRecordingId: string;

const hasAssemblyKey = !!(
  process.env.ASSEMBLYAI_API_KEY || process.env.ASSEMBLY_API_KEY
);

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
    `[integration:transcribe] schema=${process.env.SUPABASE_DB_SCHEMA || 'public'}, bucket=${bucket}, assemblyKey=${hasAssemblyKey ? 'yes' : 'MISSING (flow tests will be skipped)'}`
  );

  // 1. Create a test anthology
  const title = `Transcribe Test ${Date.now()}`;
  const createReq = mockReq({ method: 'POST', body: { title } });
  const createMock = mockRes();
  await anthologiesHandler(createReq, createMock.res);

  if (createMock.statusCode !== 201) {
    throw new Error(`Failed to create test anthology: ${JSON.stringify(createMock.body)}`);
  }

  testAnthologyId = createMock.body.data.id;
  testSlug = createMock.body.data.slug;
  createdAnthologyIds.push(testAnthologyId);
  console.log(`[integration:transcribe] created test anthology: ${testSlug} (${testAnthologyId})`);

  // 2. Upload a fake audio file so we have a recording with metadata.object_path
  const uploadReq = mockReq({
    method: 'POST',
    query: { slug: testSlug },
    headers: {
      'x-filename': 'test-transcribe.mp3',
      'content-type': 'audio/mpeg',
    },
    body: Buffer.from('fake mp3 content for transcribe test'),
  });
  const uploadMock = mockRes();
  await uploadHandler(uploadReq, uploadMock.res);

  if (uploadMock.statusCode !== 201) {
    throw new Error(`Failed to upload test file: ${JSON.stringify(uploadMock.body)}`);
  }

  testRecordingId = uploadMock.body.data.recordingId;
  createdRecordingIds.push(testRecordingId);
  uploadedObjects.push({ bucket: uploadMock.body.data.bucket, path: uploadMock.body.data.path });
  console.log(`[integration:transcribe] uploaded test file, recordingId=${testRecordingId}`);
});

afterAll(async () => {
  // Clean up transcript files that may have been created
  for (const obj of uploadedObjects) {
    // Remove the original file
    await supabase.storage.from(obj.bucket).remove([obj.path]);
    // Also try to remove the transcript file (.transcript.json)
    await supabase.storage.from(obj.bucket).remove([`${obj.path}.transcript.json`]);
  }
  if (uploadedObjects.length > 0) {
    console.log(`[integration:transcribe] cleaned up ${uploadedObjects.length} uploaded file(s) + transcripts`);
  }

  // Clean up recordings (before anthologies, due to foreign key)
  if (createdRecordingIds.length > 0) {
    const { error } = await supabase
      .from('anthology_recordings')
      .delete()
      .in('id', createdRecordingIds);
    if (error) {
      console.warn('[integration:transcribe] cleanup warning — could not delete test recordings:', error.message);
    } else {
      console.log(`[integration:transcribe] cleaned up ${createdRecordingIds.length} test recording(s)`);
    }
  }

  // Clean up anthologies
  if (createdAnthologyIds.length > 0) {
    const { error } = await supabase
      .from('anthology_anthologies')
      .delete()
      .in('id', createdAnthologyIds);
    if (error) {
      console.warn('[integration:transcribe] cleanup warning — could not delete test anthologies:', error.message);
    } else {
      console.log(`[integration:transcribe] cleaned up ${createdAnthologyIds.length} test anthology(ies)`);
    }
  }
});

// ────────────────────────────────────────────────────────────────
// POST /api/transcribe — validation / error paths
// ────────────────────────────────────────────────────────────────
describe('POST /api/transcribe — validation', () => {
  it('returns 405 for non-POST methods', async () => {
    const req = mockReq({ method: 'GET' });
    const mock = mockRes();
    await transcribeHandler(req, mock.res);

    expect(mock.statusCode).toBe(405);
    expect(mock.body.error.code).toBe('METHOD_NOT_ALLOWED');
  });

  it('returns 400 when recordingId is missing', async () => {
    const req = mockReq({ method: 'POST', body: {} });
    const mock = mockRes();
    await transcribeHandler(req, mock.res);

    expect(mock.statusCode).toBe(400);
    expect(mock.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when recordingId is not a valid UUID', async () => {
    const req = mockReq({ method: 'POST', body: { recordingId: 'not-a-uuid' } });
    const mock = mockRes();
    await transcribeHandler(req, mock.res);

    expect(mock.statusCode).toBe(400);
    expect(mock.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 for non-existent recording', async () => {
    const req = mockReq({
      method: 'POST',
      body: { recordingId: '00000000-0000-0000-0000-000000000000' },
    });
    const mock = mockRes();
    await transcribeHandler(req, mock.res);

    expect(mock.statusCode).toBe(404);
    expect(mock.body.error.code).toBe('NOT_FOUND');
  });
});

// ────────────────────────────────────────────────────────────────
// GET /api/transcribe/status — validation / error paths
// ────────────────────────────────────────────────────────────────
describe('GET /api/transcribe/status — validation', () => {
  it('returns 405 for non-GET methods', async () => {
    const req = mockReq({ method: 'POST' });
    const mock = mockRes();
    await transcribeStatusHandler(req, mock.res);

    expect(mock.statusCode).toBe(405);
    expect(mock.body.error.code).toBe('METHOD_NOT_ALLOWED');
  });

  it('returns 400 when recordingId is missing', async () => {
    const req = mockReq({ method: 'GET', query: {} });
    const mock = mockRes();
    await transcribeStatusHandler(req, mock.res);

    expect(mock.statusCode).toBe(400);
    expect(mock.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 for non-existent recording', async () => {
    const req = mockReq({
      method: 'GET',
      query: { recordingId: '00000000-0000-0000-0000-000000000000' },
    });
    const mock = mockRes();
    await transcribeStatusHandler(req, mock.res);

    expect(mock.statusCode).toBe(404);
    expect(mock.body.error.code).toBe('NOT_FOUND');
  });

  it('returns status for an existing recording (before transcription starts)', async () => {
    const req = mockReq({
      method: 'GET',
      query: { recordingId: testRecordingId },
    });
    const mock = mockRes();
    await transcribeStatusHandler(req, mock.res);

    expect(mock.statusCode).toBe(200);
    expect(mock.body.data.recordingId).toBe(testRecordingId);
    expect(mock.body.data.status).toBeNull();
    expect(mock.body.data.assemblyId).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────
// POST /api/transcribe/tick — validation / error paths
// ────────────────────────────────────────────────────────────────
describe('POST /api/transcribe/tick — validation', () => {
  it('returns 405 for non-POST methods', async () => {
    const req = mockReq({ method: 'GET' });
    const mock = mockRes();
    await transcribeTickHandler(req, mock.res);

    expect(mock.statusCode).toBe(405);
    expect(mock.body.error.code).toBe('METHOD_NOT_ALLOWED');
  });

  it('returns 400 when recordingId is missing', async () => {
    const req = mockReq({ method: 'POST', body: {} });
    const mock = mockRes();
    await transcribeTickHandler(req, mock.res);

    expect(mock.statusCode).toBe(400);
    expect(mock.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 for non-existent recording', async () => {
    const req = mockReq({
      method: 'POST',
      body: { recordingId: '00000000-0000-0000-0000-000000000000' },
    });
    const mock = mockRes();
    await transcribeTickHandler(req, mock.res);

    expect(mock.statusCode).toBe(404);
    expect(mock.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 400 when no assembly_id in metadata (transcription not started)', async () => {
    const req = mockReq({
      method: 'POST',
      body: { recordingId: testRecordingId },
    });
    const mock = mockRes();
    await transcribeTickHandler(req, mock.res);

    expect(mock.statusCode).toBe(400);
    expect(mock.body.error.code).toBe('BAD_REQUEST');
  });
});

// ────────────────────────────────────────────────────────────────
// Full transcription flow (requires ASSEMBLYAI_API_KEY)
// ────────────────────────────────────────────────────────────────
describe('Transcription flow (requires ASSEMBLYAI_API_KEY)', () => {
  // Upload a separate file for the flow test so we don't interfere with validation tests
  let flowRecordingId: string;

  beforeAll(async () => {
    const uploadReq = mockReq({
      method: 'POST',
      query: { slug: testSlug },
      headers: {
        'x-filename': 'flow-test.mp3',
        'content-type': 'audio/mpeg',
      },
      body: Buffer.from('fake mp3 for flow test'),
    });
    const uploadMock = mockRes();
    await uploadHandler(uploadReq, uploadMock.res);

    if (uploadMock.statusCode !== 201) {
      throw new Error(`Failed to upload flow test file: ${JSON.stringify(uploadMock.body)}`);
    }

    flowRecordingId = uploadMock.body.data.recordingId;
    createdRecordingIds.push(flowRecordingId);
    uploadedObjects.push({ bucket: uploadMock.body.data.bucket, path: uploadMock.body.data.path });
  });

  it.skipIf(!hasAssemblyKey)('POST /api/transcribe starts a job and returns 202', async () => {
    const req = mockReq({
      method: 'POST',
      body: { recordingId: flowRecordingId },
    });
    const mock = mockRes();
    await transcribeHandler(req, mock.res);

    expect(mock.statusCode).toBe(202);
    expect(mock.body.data.recordingId).toBe(flowRecordingId);
    expect(mock.body.data.status).toBe('processing');
    expect(mock.body.data.assemblyId).toBeTruthy();
    expect(mock.body.data.transcriptPath).toContain('.transcript.json');
  });

  it.skipIf(!hasAssemblyKey)('GET /api/transcribe/status shows processing after start', async () => {
    const req = mockReq({
      method: 'GET',
      query: { recordingId: flowRecordingId },
    });
    const mock = mockRes();
    await transcribeStatusHandler(req, mock.res);

    expect(mock.statusCode).toBe(200);
    expect(mock.body.data.recordingId).toBe(flowRecordingId);
    expect(mock.body.data.status).toBe('processing');
    expect(mock.body.data.assemblyId).toBeTruthy();
    expect(mock.body.data.startedAt).toBeTruthy();
  });

  it.skipIf(!hasAssemblyKey)('POST /api/transcribe is idempotent (returns existing state)', async () => {
    const req = mockReq({
      method: 'POST',
      body: { recordingId: flowRecordingId },
    });
    const mock = mockRes();
    await transcribeHandler(req, mock.res);

    // Returns 200 (not 202) because the job already exists
    expect(mock.statusCode).toBe(200);
    expect(mock.body.data.recordingId).toBe(flowRecordingId);
    expect(['processing', 'completed']).toContain(mock.body.data.status);
    expect(mock.body.data.assemblyId).toBeTruthy();
  });

  it.skipIf(!hasAssemblyKey)('POST /api/transcribe/tick returns a valid response', async () => {
    const req = mockReq({
      method: 'POST',
      body: { recordingId: flowRecordingId },
    });
    const mock = mockRes();
    await transcribeTickHandler(req, mock.res);

    expect(mock.statusCode).toBe(200);

    // AssemblyAI may still be processing or may have errored on the fake file
    const { status, didWork } = mock.body.data;
    expect(['processing', 'completed', 'error']).toContain(status);
    expect(typeof didWork).toBe('boolean');

    if (status === 'processing') {
      expect(didWork).toBe(false);
      expect(mock.body.data.assemblyStatus).toBeTruthy();
    }

    if (status === 'completed') {
      expect(didWork).toBe(true);
      expect(mock.body.data.audioDurationMs).toBeDefined();
      expect(mock.body.data.transcriptPath).toContain('.transcript.json');
    }

    if (status === 'error') {
      expect(didWork).toBe(true);
      expect(mock.body.data.error).toBeTruthy();
    }
  });

  it.skipIf(!hasAssemblyKey)('recording metadata is updated after start', async () => {
    const { data: recording } = await supabase
      .from('anthology_recordings')
      .select('metadata')
      .eq('id', flowRecordingId)
      .single();

    expect(recording).toBeTruthy();
    const md = recording!.metadata as Record<string, unknown>;
    expect(md.transcription_status).toBeTruthy();
    expect(md.assembly_id).toBeTruthy();
    expect(md.transcript_path).toContain('.transcript.json');
    expect(md.transcription_started_at).toBeTruthy();
  });
});

/**
 * Integration tests for POST /api/anthologies
 *
 * These tests hit the REAL Supabase instance configured in .env.
 * They create actual rows in the public schema.
 * and clean up after themselves.
 *
 * Run with:  npm run test:integration
 */

// .env is loaded by tests/integration/setup.ts (vitest setupFiles)

import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { mockReq, mockRes } from '../api/_helpers';
import handler from '../../api/anthologies/index';
import { supabase } from '../../api/_lib/supabase';

// Track IDs of anthologies created during tests so we can clean up
const createdIds: string[] = [];

beforeAll(() => {
  // Sanity-check: make sure real Supabase credentials are present
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error(
      'Integration tests require SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env'
    );
  }
  console.log(
    `[integration] schema=public, url=${url.slice(0, 30)}…`
  );
});

afterAll(async () => {
  // Delete every anthology created during this run
  if (createdIds.length > 0) {
    const { error } = await supabase
      .from('anthology_anthologies')
      .delete()
      .in('id', createdIds);

    if (error) {
      console.warn('[integration] cleanup warning — could not delete test rows:', error.message);
    } else {
      console.log(`[integration] cleaned up ${createdIds.length} test anthology(ies)`);
    }
  }
});

describe('POST /api/anthologies (integration)', () => {
  it('creates a real anthology and returns 201', async () => {
    const title = `Integration Test ${Date.now()}`;
    const req = mockReq({ method: 'POST', body: { title } });
    const mock = mockRes();

    await handler(req, mock.res);

    expect(mock.statusCode).toBe(201);
    expect(mock.body.data).toBeDefined();
    expect(mock.body.data.title).toBe(title);
    expect(mock.body.data.id).toBeTruthy();
    expect(mock.body.data.slug).toBeTruthy();
    expect(mock.body.data.isPublic).toBe(false);
    expect(mock.body.data.createdAt).toBeTruthy();

    createdIds.push(mock.body.data.id);
  });

  it('created anthology is readable via GET', async () => {
    // First, create one
    const title = `Integration Read Test ${Date.now()}`;
    const createReq = mockReq({ method: 'POST', body: { title } });
    const createMock = mockRes();
    await handler(createReq, createMock.res);

    expect(createMock.statusCode).toBe(201);
    const created = createMock.body.data;
    createdIds.push(created.id);

    // Fetch the list including non-public anthologies
    const getReq = mockReq({ method: 'GET', query: { publicOnly: 'false' } });
    const getMock = mockRes();
    await handler(getReq, getMock.res);

    expect(getMock.statusCode).toBe(200);
    const found = getMock.body.data.find((a: any) => a.id === created.id);
    expect(found).toBeDefined();
    expect(found.title).toBe(title);
    expect(found.slug).toBe(created.slug);
  });

  it('created anthology exists in the database', async () => {
    const title = `Integration DB Verify ${Date.now()}`;
    const req = mockReq({ method: 'POST', body: { title } });
    const mock = mockRes();
    await handler(req, mock.res);

    expect(mock.statusCode).toBe(201);
    const id = mock.body.data.id;
    createdIds.push(id);

    // Verify directly via Supabase query
    const { data, error } = await supabase
      .from('anthology_anthologies')
      .select('id, title, slug, is_public')
      .eq('id', id)
      .single();

    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data!.title).toBe(title);
    expect(data!.is_public).toBe(false);
  });

  it('handles slug collision by appending timestamp', async () => {
    const slug = `collision-test-${Date.now()}`;

    // Create first with explicit slug
    const req1 = mockReq({ method: 'POST', body: { title: 'First', slug } });
    const mock1 = mockRes();
    await handler(req1, mock1.res);
    expect(mock1.statusCode).toBe(201);
    expect(mock1.body.data.slug).toBe(slug);
    createdIds.push(mock1.body.data.id);

    // Create second with same slug — should get a suffixed slug
    const req2 = mockReq({ method: 'POST', body: { title: 'Second', slug } });
    const mock2 = mockRes();
    await handler(req2, mock2.res);
    expect(mock2.statusCode).toBe(201);
    expect(mock2.body.data.slug).not.toBe(slug);
    expect(mock2.body.data.slug).toContain(slug); // starts with the original
    createdIds.push(mock2.body.data.id);
  });

  it('rejects empty title with 400', async () => {
    const req = mockReq({ method: 'POST', body: { title: '' } });
    const mock = mockRes();
    await handler(req, mock.res);

    expect(mock.statusCode).toBe(400);
    expect(mock.body.error.code).toBe('VALIDATION_ERROR');
    // No cleanup needed — nothing was created
  });
});

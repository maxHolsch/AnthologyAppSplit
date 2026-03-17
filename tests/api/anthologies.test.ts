import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReq, mockRes } from './_helpers';

// ---------------------------------------------------------------------------
// Mock the supabase module before importing the handler.
// vi.hoisted() runs before vi.mock factory (both hoisted above imports).
// ---------------------------------------------------------------------------

const { supabaseMock, mockState } = vi.hoisted(() => {
  // Shared state that tests can mutate via `mockState`
  const mockState = {
    insertReturn: { data: null as any, error: null as any },
    selectReturn: { data: null as any, error: null as any, count: 0 as number | undefined },
  };

  let isInsert = false;

  const chain: any = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          const ret = isInsert ? mockState.insertReturn : mockState.selectReturn;
          return (resolve: any) => resolve(ret);
        }
        if (prop === 'from') {
          return () => { isInsert = false; return chain; };
        }
        if (prop === 'insert') {
          return () => { isInsert = true; return chain; };
        }
        return () => chain;
      },
    }
  );

  return { supabaseMock: chain, mockState };
});

vi.mock('../../api/_lib/supabase', () => ({
  supabase: supabaseMock,
  getSupabase: () => supabaseMock,
  assertSupabaseConfigured: () => {},
  getConversationsBucket: () => 'Conversations',
}));

// Import handler AFTER mocks
import handler from '../../api/anthologies/index';

describe('POST /api/anthologies', () => {
  beforeEach(() => {
    mockState.insertReturn = { data: null, error: null };
    mockState.selectReturn = { data: null, error: null, count: 0 };
  });

  // ---- Validation ----

  it('rejects non-POST/GET methods with 405', async () => {
    const req = mockReq({ method: 'DELETE' });
    const mock = mockRes();

    await handler(req, mock.res);

    expect(mock.statusCode).toBe(405);
    expect(mock.body.error.code).toBe('METHOD_NOT_ALLOWED');
  });

  it('rejects empty body with 400 validation error', async () => {
    const req = mockReq({ method: 'POST', body: {} });
    const mock = mockRes();

    await handler(req, mock.res);

    expect(mock.statusCode).toBe(400);
    expect(mock.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects missing title with 400', async () => {
    const req = mockReq({ method: 'POST', body: { title: '' } });
    const mock = mockRes();

    await handler(req, mock.res);

    expect(mock.statusCode).toBe(400);
    expect(mock.body.error.code).toBe('VALIDATION_ERROR');
  });

  // ---- Successful creation ----

  it('creates anthology with auto-generated slug and returns 201', async () => {
    mockState.insertReturn = {
      data: {
        id: 'aaaa-bbbb-cccc',
        slug: 'my-test-anthology',
        title: 'My Test Anthology',
        is_public: false,
        created_at: '2024-06-01T00:00:00Z',
      },
      error: null,
    };

    const req = mockReq({
      method: 'POST',
      body: { title: 'My Test Anthology' },
    });
    const mock = mockRes();

    await handler(req, mock.res);

    expect(mock.statusCode).toBe(201);
    expect(mock.body.data).toEqual({
      id: 'aaaa-bbbb-cccc',
      slug: 'my-test-anthology',
      title: 'My Test Anthology',
      description: null,
      isPublic: false,
      createdAt: '2024-06-01T00:00:00Z',
    });
  });

  it('creates anthology with explicit slug', async () => {
    mockState.insertReturn = {
      data: {
        id: 'aaaa-bbbb-cccc',
        slug: 'custom-slug',
        title: 'Title Here',
        is_public: false,
        created_at: '2024-06-01T00:00:00Z',
      },
      error: null,
    };

    const req = mockReq({
      method: 'POST',
      body: { title: 'Title Here', slug: 'custom-slug' },
    });
    const mock = mockRes();

    await handler(req, mock.res);

    expect(mock.statusCode).toBe(201);
    expect(mock.body.data.slug).toBe('custom-slug');
  });

  // ---- Database error ----

  it('returns 500 on persistent database error', async () => {
    mockState.insertReturn = {
      data: null,
      error: { message: 'connection refused', code: 'FATAL' },
    };

    const req = mockReq({
      method: 'POST',
      body: { title: 'My Anthology' },
    });
    const mock = mockRes();

    await handler(req, mock.res);

    expect(mock.statusCode).toBe(500);
    expect(mock.body.error.code).toBe('DATABASE_ERROR');
  });

  // ---- isPublic is always false ----

  it('creates anthology with isPublic=false', async () => {
    mockState.insertReturn = {
      data: {
        id: 'test-id',
        slug: 'test',
        title: 'Test',
        is_public: false,
        created_at: '2024-06-01T00:00:00Z',
      },
      error: null,
    };

    const req = mockReq({
      method: 'POST',
      body: { title: 'Test' },
    });
    const mock = mockRes();

    await handler(req, mock.res);

    expect(mock.statusCode).toBe(201);
    expect(mock.body.data.isPublic).toBe(false);
  });

  // ---- Response shape ----

  it('wraps response in { data: ... } envelope', async () => {
    mockState.insertReturn = {
      data: {
        id: 'test-id',
        slug: 'test',
        title: 'Test',
        is_public: false,
        created_at: '2024-06-01T00:00:00Z',
      },
      error: null,
    };

    const req = mockReq({
      method: 'POST',
      body: { title: 'Test' },
    });
    const mock = mockRes();

    await handler(req, mock.res);

    expect(mock.body).toHaveProperty('data');
    expect(mock.body.data).toHaveProperty('id');
    expect(mock.body.data).toHaveProperty('slug');
    expect(mock.body.data).toHaveProperty('title');
    expect(mock.body.data).toHaveProperty('isPublic');
    expect(mock.body.data).toHaveProperty('createdAt');
  });
});

describe('GET /api/anthologies', () => {
  beforeEach(() => {
    mockState.insertReturn = { data: null, error: null };
    mockState.selectReturn = { data: null, error: null, count: 0 };
  });

  it('returns paginated list of anthologies', async () => {
    mockState.selectReturn = {
      data: [
        {
          id: 'id-1',
          slug: 'first',
          title: 'First',
          description: null,
          is_public: true,
          created_at: '2024-01-01T00:00:00Z',
        },
      ],
      error: null,
      count: 1,
    };

    const req = mockReq({ method: 'GET', query: {} });
    const mock = mockRes();

    await handler(req, mock.res);

    expect(mock.statusCode).toBe(200);
    expect(mock.body.data).toHaveLength(1);
    expect(mock.body.data[0].slug).toBe('first');
    expect(mock.body.meta).toEqual({
      total: 1,
      limit: 50,
      offset: 0,
      hasMore: false,
    });
  });

  it('returns empty list when no anthologies exist', async () => {
    mockState.selectReturn = { data: [], error: null, count: 0 };

    const req = mockReq({ method: 'GET', query: {} });
    const mock = mockRes();

    await handler(req, mock.res);

    expect(mock.statusCode).toBe(200);
    expect(mock.body.data).toHaveLength(0);
    expect(mock.body.meta.total).toBe(0);
    expect(mock.body.meta.hasMore).toBe(false);
  });

  it('returns 500 on database error', async () => {
    mockState.selectReturn = { data: null, error: { message: 'timeout' }, count: 0 };

    const req = mockReq({ method: 'GET', query: {} });
    const mock = mockRes();

    await handler(req, mock.res);

    expect(mock.statusCode).toBe(500);
    expect(mock.body.error.code).toBe('DATABASE_ERROR');
  });
});

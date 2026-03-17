/**
 * Test helpers: mock VercelRequest / VercelResponse objects.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

export interface MockResponse {
  /** Captured status code (updated by res.status().json()) */
  statusCode: number;
  /** Captured JSON body */
  body: any;
  /** The mock VercelResponse to pass into handlers */
  res: VercelResponse;
}

/**
 * Build a mock VercelRequest.
 */
export function mockReq(overrides: {
  method?: string;
  query?: Record<string, string | string[]>;
  body?: any;
  headers?: Record<string, string>;
}): VercelRequest {
  return {
    method: overrides.method ?? 'GET',
    url: '/',
    headers: overrides.headers ?? {},
    body: overrides.body ?? undefined,
    query: overrides.query ?? {},
    cookies: {},
  } as unknown as VercelRequest;
}

/**
 * Build a mock VercelResponse that captures status + json calls.
 * Use mock.statusCode and mock.body to read captured values after the handler runs.
 */
export function mockRes(): MockResponse {
  // Use a single object so closure writes go to the same reference callers read from.
  const mock: MockResponse = {
    statusCode: 200,
    body: null,
    res: null as any,
  };

  let pendingStatus = 200;

  const res = {
    status(code: number) {
      pendingStatus = code;
      return res;
    },
    json(data: any) {
      mock.statusCode = pendingStatus;
      mock.body = data;
      return res;
    },
    end() {
      mock.statusCode = pendingStatus;
      return res;
    },
    setHeader() {
      return res;
    },
  } as unknown as VercelResponse;

  mock.res = res;
  return mock;
}

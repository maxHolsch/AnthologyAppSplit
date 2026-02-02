/**
 * API Client
 * Centralized HTTP client for making API requests
 */

import type { ApiResponse as ApiResponseType, ApiErrorResponse, PaginationMeta } from '../../shared/types/api.types';

// Base URL for API requests
// In development, Vite proxies /api to the Vercel dev server
// In production, /api routes directly to Vercel functions
const API_BASE_URL = '/api';

/**
 * API error class for handling error responses
 */
export class ApiError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details?: Record<string, unknown>;

  constructor(response: ApiErrorResponse, statusCode: number) {
    super(response.error.message);
    this.name = 'ApiError';
    this.code = response.error.code;
    this.statusCode = statusCode;
    this.details = response.error.details;
  }
}

/**
 * Type for paginated API response
 */
export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

/**
 * Fetch options with auth support
 */
interface FetchOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
}

/**
 * Get the stored auth token (if any)
 */
function getAuthToken(): string | null {
  // Check for Supabase session token
  // This can be extended to use other auth mechanisms
  try {
    const supabaseAuth = localStorage.getItem('sb-auth-token');
    if (supabaseAuth) {
      const parsed = JSON.parse(supabaseAuth);
      return parsed?.access_token || null;
    }
  } catch {
    // Ignore parse errors
  }
  return null;
}

/**
 * Build URL with query parameters
 */
function buildUrl(path: string, params?: Record<string, string | number | boolean | undefined>): string {
  const url = new URL(`${API_BASE_URL}${path}`, window.location.origin);

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    });
  }

  return url.toString();
}

/**
 * Make an API request
 */
async function request<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { params, ...fetchOptions } = options;
  const url = buildUrl(path, params);

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...fetchOptions.headers,
  };

  // Add auth token if available
  const token = getAuthToken();
  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...fetchOptions,
    headers,
  });

  // Handle no content response
  if (response.status === 204) {
    return undefined as T;
  }

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(data as ApiErrorResponse, response.status);
  }

  return data as T;
}

/**
 * GET request
 */
export async function get<T>(
  path: string,
  params?: Record<string, string | number | boolean | undefined>
): Promise<T> {
  const response = await request<ApiResponseType<T>>(path, { params, method: 'GET' });
  return response.data;
}

/**
 * GET request with pagination
 */
export async function getList<T>(
  path: string,
  params?: Record<string, string | number | boolean | undefined>
): Promise<PaginatedResponse<T>> {
  return request<PaginatedResponse<T>>(path, { params, method: 'GET' });
}

/**
 * POST request
 */
export async function post<T, B = unknown>(path: string, body: B): Promise<T> {
  const response = await request<ApiResponseType<T>>(path, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return response.data;
}

/**
 * PATCH request
 */
export async function patch<T, B = unknown>(path: string, body: B): Promise<T> {
  const response = await request<ApiResponseType<T>>(path, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  return response.data;
}

/**
 * DELETE request
 */
export async function del(path: string): Promise<void> {
  await request<void>(path, { method: 'DELETE' });
}

/**
 * API client object for convenient access
 */
export const apiClient = {
  get,
  getList,
  post,
  patch,
  delete: del,
};

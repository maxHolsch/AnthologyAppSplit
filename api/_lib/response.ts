/**
 * API Response Helpers
 * Standardized JSON response formatting for API endpoints
 */

import type { VercelResponse } from '@vercel/node';
import {
  ApiException,
  ErrorCodes,
  ErrorCodeToStatus,
  wrapError,
  type ApiError,
  type ErrorCode,
} from './errors';

/**
 * Pagination metadata
 */
export interface PaginationMeta {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

/**
 * Standard success response with data
 */
export interface ApiSuccessResponse<T> {
  data: T;
  meta?: PaginationMeta;
}

/**
 * Send a JSON success response
 */
export function jsonResponse<T>(
  res: VercelResponse,
  data: T,
  status: number = 200
): VercelResponse {
  return res.status(status).json({ data });
}

/**
 * Send a paginated JSON response
 */
export function paginatedResponse<T>(
  res: VercelResponse,
  data: T[],
  meta: PaginationMeta,
  status: number = 200
): VercelResponse {
  return res.status(status).json({ data, meta });
}

/**
 * Send an error response
 */
export function errorResponse(
  res: VercelResponse,
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>
): VercelResponse {
  const status = ErrorCodeToStatus[code];
  const error: ApiError = {
    error: {
      code,
      message,
      ...(details && { details }),
    },
  };
  return res.status(status).json(error);
}

/**
 * Send an error response from an ApiException
 */
export function exceptionResponse(res: VercelResponse, exception: ApiException): VercelResponse {
  return res.status(exception.statusCode).json(exception.toResponse());
}

/**
 * Handle any error and send appropriate response
 * Use this in catch blocks to ensure consistent error handling
 */
export function handleError(res: VercelResponse, error: unknown): VercelResponse {
  const apiError = wrapError(error);

  // Log server errors
  if (apiError.statusCode >= 500) {
    console.error('[API Error]', apiError.message, apiError.details);
  }

  return exceptionResponse(res, apiError);
}

/**
 * Send a 204 No Content response (for successful DELETE operations)
 */
export function noContent(res: VercelResponse): VercelResponse {
  return res.status(204).end();
}

/**
 * Send a created response (201) with the created resource
 */
export function createdResponse<T>(res: VercelResponse, data: T): VercelResponse {
  return res.status(201).json({ data });
}

/**
 * Validate required fields in request body
 */
export function validateRequired<T extends Record<string, unknown>>(
  body: T,
  requiredFields: (keyof T)[]
): string[] {
  const missing: string[] = [];
  for (const field of requiredFields) {
    if (body[field] === undefined || body[field] === null || body[field] === '') {
      missing.push(String(field));
    }
  }
  return missing;
}

/**
 * API Error Handling
 * Standardized error types and handling for API endpoints
 */

/**
 * Standard API error codes
 */
export const ErrorCodes = {
  // Client errors (4xx)
  BAD_REQUEST: 'BAD_REQUEST',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
  CONFLICT: 'CONFLICT',

  // Server errors (5xx)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/**
 * HTTP status codes mapped to error codes
 */
export const ErrorCodeToStatus: Record<ErrorCode, number> = {
  [ErrorCodes.BAD_REQUEST]: 400,
  [ErrorCodes.VALIDATION_ERROR]: 400,
  [ErrorCodes.UNAUTHORIZED]: 401,
  [ErrorCodes.FORBIDDEN]: 403,
  [ErrorCodes.NOT_FOUND]: 404,
  [ErrorCodes.METHOD_NOT_ALLOWED]: 405,
  [ErrorCodes.CONFLICT]: 409,
  [ErrorCodes.INTERNAL_ERROR]: 500,
  [ErrorCodes.DATABASE_ERROR]: 500,
  [ErrorCodes.SERVICE_UNAVAILABLE]: 503,
};

/**
 * API Error structure returned to clients
 */
export interface ApiError {
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
}

/**
 * Exception class for API errors
 * Throw this in handlers to automatically return standardized error responses
 */
export class ApiException extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiException';
    this.code = code;
    this.statusCode = ErrorCodeToStatus[code];
    this.details = details;
  }

  /**
   * Convert to API error response format
   */
  toResponse(): ApiError {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details && { details: this.details }),
      },
    };
  }
}

/**
 * Create a NOT_FOUND error
 */
export function notFound(resource: string, id?: string): ApiException {
  return new ApiException(
    ErrorCodes.NOT_FOUND,
    `${resource} not found`,
    id ? { id } : undefined
  );
}

/**
 * Create a BAD_REQUEST error
 */
export function badRequest(message: string, details?: Record<string, unknown>): ApiException {
  return new ApiException(ErrorCodes.BAD_REQUEST, message, details);
}

/**
 * Create a VALIDATION_ERROR from Zod errors
 */
export function validationError(
  message: string,
  fieldErrors?: Record<string, string[]>
): ApiException {
  return new ApiException(ErrorCodes.VALIDATION_ERROR, message, fieldErrors ? { fieldErrors } : undefined);
}

/**
 * Create a DATABASE_ERROR
 */
export function databaseError(message: string, originalError?: unknown): ApiException {
  const details: Record<string, unknown> = {};
  if (originalError instanceof Error) {
    details.originalMessage = originalError.message;
  }
  return new ApiException(ErrorCodes.DATABASE_ERROR, message, Object.keys(details).length > 0 ? details : undefined);
}

/**
 * Create a METHOD_NOT_ALLOWED error
 */
export function methodNotAllowed(allowed: string[]): ApiException {
  return new ApiException(
    ErrorCodes.METHOD_NOT_ALLOWED,
    `Method not allowed. Allowed methods: ${allowed.join(', ')}`,
    { allowedMethods: allowed }
  );
}

/**
 * Wrap unknown errors into ApiException
 */
export function wrapError(error: unknown): ApiException {
  if (error instanceof ApiException) {
    return error;
  }

  if (error instanceof Error) {
    return new ApiException(ErrorCodes.INTERNAL_ERROR, error.message);
  }

  return new ApiException(ErrorCodes.INTERNAL_ERROR, 'An unexpected error occurred');
}

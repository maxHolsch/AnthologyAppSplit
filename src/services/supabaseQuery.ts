/**
 * Supabase query wrapper for consistent error handling
 *
 * Provides standardized error handling patterns for all Supabase queries.
 */

import type { PostgrestError } from '@supabase/supabase-js';

/**
 * Standard error class for Supabase operations
 */
export class SupabaseQueryError extends Error {
  constructor(
    message: string,
    public readonly originalError: PostgrestError,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'SupabaseQueryError';
  }
}

/**
 * Wraps a Supabase query with consistent error handling
 *
 * @param queryFn - Function that performs the Supabase query
 * @param options - Configuration options
 * @returns The query result data
 * @throws SupabaseQueryError if the query fails
 *
 * @example
 * ```typescript
 * const anthology = await supabaseQuery(
 *   () => supabase.from('anthology_anthologies').select('*').eq('id', id).single(),
 *   { operation: 'fetch anthology', context: { id } }
 * );
 * ```
 */
export async function supabaseQuery<T>(
  queryFn: () => Promise<{ data: T | null; error: PostgrestError | null }>,
  options?: {
    /** Description of the operation for error messages */
    operation?: string;
    /** Additional context for debugging */
    context?: Record<string, unknown>;
    /** Whether to log errors (default: true) */
    logErrors?: boolean;
  }
): Promise<T> {
  const { operation = 'query', context, logErrors = true } = options || {};

  const { data, error } = await queryFn();

  if (error) {
    if (logErrors) {
      console.error(`[SupabaseQuery] Error during ${operation}:`, error, context);
    }
    throw new SupabaseQueryError(
      `Failed to ${operation}: ${error.message}`,
      error,
      context
    );
  }

  if (data === null) {
    throw new SupabaseQueryError(
      `No data returned from ${operation}`,
      { message: 'No data returned', details: '', hint: '', code: 'NO_DATA' } as PostgrestError,
      context
    );
  }

  return data;
}

/**
 * Wraps a Supabase query that may legitimately return null
 *
 * @param queryFn - Function that performs the Supabase query
 * @param options - Configuration options
 * @returns The query result data or null if not found
 * @throws SupabaseQueryError if the query fails (but not if data is null)
 *
 * @example
 * ```typescript
 * const anthology = await supabaseQueryNullable(
 *   () => supabase.from('anthology_anthologies').select('*').eq('slug', slug).maybeSingle(),
 *   { operation: 'find anthology by slug' }
 * );
 * // anthology could be null if not found
 * ```
 */
export async function supabaseQueryNullable<T>(
  queryFn: () => Promise<{ data: T | null; error: PostgrestError | null }>,
  options?: {
    operation?: string;
    context?: Record<string, unknown>;
    logErrors?: boolean;
  }
): Promise<T | null> {
  const { operation = 'query', context, logErrors = true } = options || {};

  const { data, error } = await queryFn();

  if (error) {
    if (logErrors) {
      console.error(`[SupabaseQuery] Error during ${operation}:`, error, context);
    }
    throw new SupabaseQueryError(
      `Failed to ${operation}: ${error.message}`,
      error,
      context
    );
  }

  return data;
}

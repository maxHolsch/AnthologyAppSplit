/**
 * Server-side Supabase Client
 * Uses service role key for server-only operations (bypasses RLS)
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Support both naming conventions for flexibility
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
const supabaseDbSchema = process.env.SUPABASE_DB_SCHEMA || 'public';

// Widen generic so the schema can be a runtime string, not just the literal "public"
type AnySchemaClient = SupabaseClient<any, string>;

// Lazily-initialized client — never created at module load time so any
// crash happens inside a handler's try/catch, not before it.
let _supabase: AnySchemaClient | null = null;

/**
 * Returns the server-side Supabase client.
 * Throws a clear error if credentials are missing so the handler can return JSON 500.
 */
export function getSupabase(): AnySchemaClient {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error(
      'Server misconfiguration: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set'
    );
  }
  if (!_supabase) {
    _supabase = createClient(supabaseUrl, supabaseServiceKey, {
      db: { schema: supabaseDbSchema },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return _supabase;
}

/**
 * Server-side Supabase client.
 * Backed by a Proxy so createClient() is never called at module load time —
 * any crash from missing env vars happens inside the handler's try/catch.
 */
export const supabase: AnySchemaClient = new Proxy({} as AnySchemaClient, {
  get(_target, prop) {
    const client = getSupabase();
    const value = (client as any)[prop];
    return typeof value === 'function' ? value.bind(client) : value;
  },
});

/**
 * Returns the correct Conversations storage bucket name based on the active schema.
 * "public" → "Conversations", any other schema → "Development_Conversations"
 */
export function getConversationsBucket(): string {
  const prefix = supabaseDbSchema !== 'public' ? 'Development_' : '';
  return `${prefix}Conversations`;
}

/**
 * @deprecated Use getSupabase() instead.
 */
export function assertSupabaseConfigured(): void {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error(
      'Server misconfiguration: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set'
    );
  }
}

/**
 * Create a new Supabase client instance
 */
export function createServerSupabase(): AnySchemaClient {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error(
      'Server misconfiguration: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set'
    );
  }
  return createClient(supabaseUrl, supabaseServiceKey, {
    db: { schema: supabaseDbSchema },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: { fetch: nodeFetch },
  });
}

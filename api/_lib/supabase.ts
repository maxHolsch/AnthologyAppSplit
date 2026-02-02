/**
 * Server-side Supabase Client
 * Uses service role key for server-only operations (bypasses RLS)
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Support both naming conventions for flexibility
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl) {
  throw new Error('Missing required environment variable: SUPABASE_URL or VITE_SUPABASE_URL');
}

if (!supabaseServiceKey) {
  throw new Error('Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_KEY');
}

/**
 * Server-side Supabase client with service role key
 * This bypasses RLS and should only be used in API routes
 */
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

/**
 * Create a new Supabase client instance
 * Use this when you need a fresh client (e.g., for concurrent requests)
 */
export function createServerSupabase(): SupabaseClient {
  return createClient(supabaseUrl!, supabaseServiceKey!, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

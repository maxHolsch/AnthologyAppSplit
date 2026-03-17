/**
 * Supabase Client & Shared Types
 * Shared configuration for all Supabase services
 */

import { createClient } from '@supabase/supabase-js';

// ============================================
// SUPABASE CLIENT
// ============================================

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const supabaseDbSchema = import.meta.env.VITE_SUPABASE_DB_SCHEMA || 'public';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('⚠️  Supabase credentials not found. Check anthology-app/.env');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: { schema: supabaseDbSchema },
});

// ============================================
// STORAGE BUCKET NAMES
// ============================================

// NOTE: Supabase bucket names are case-sensitive. When using a non-public schema
// (e.g. "development"), buckets are prefixed: Development_Recordings, Development_Conversations.
const isDevelopment = supabaseDbSchema !== 'public';
const bucketPrefix = isDevelopment ? 'Development_' : '';

export const RECORDINGS_BUCKET = import.meta.env.VITE_SUPABASE_RECORDINGS_BUCKET || `${bucketPrefix}Recordings`;
export const CONVERSATIONS_BUCKET = import.meta.env.VITE_SUPABASE_CONVERSATIONS_BUCKET || `${bucketPrefix}Conversations`;

// ============================================
// DATABASE TYPES
// ============================================

export interface DbRecording {
  id: string;
  file_path: string;
  file_name: string;
  duration_ms: number;
  file_size_bytes?: number;
  mime_type?: string;
  created_at: string;
  updated_at: string;
}

export interface DbSpeaker {
  id: string;
  name: string;
  conversation_id: string;
  circle_color: string;
  faded_circle_color: string;
  quote_rectangle_color: string;
  faded_quote_rectangle_color: string;
  quote_text_color: string;
  faded_quote_text_color: string;
  created_at: string;
  updated_at: string;
}

export interface DbResponse {
  id: string;
  legacy_id?: string;
  conversation_id: string;
  responds_to_question_id?: string;
  responds_to_response_id?: string;
  speaker_id?: string;
  speaker_name: string;
  speaker_text: string;
  pull_quote?: string;
  recording_id?: string;
  audio_start_ms?: number;
  audio_end_ms?: number;
  turn_number?: number;
  metadata?: any;
  embedding?: string; // PostgreSQL vector stored as string
  created_at: string;
  updated_at: string;
}

export interface DbWordTimestamp {
  id: string;
  response_id?: string;
  question_id?: string;
  text: string;
  start_ms: number;
  end_ms: number;
  confidence?: number;
  speaker?: string;
  word_order: number;
  created_at: string;
}

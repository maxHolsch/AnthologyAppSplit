#!/usr/bin/env tsx
/**
 * Test script for /api/transcribe API
 *
 * Usage:
 *   npm run test:transcribe <recordingId>             # run the test
 *   npm run test:transcribe <recordingId> -- --reset  # clear transcription data and exit
 *
 * Or with tsx directly:
 *   tsx scripts/test-transcribe.ts <recordingId>
 *   tsx scripts/test-transcribe.ts <recordingId> --reset
 *
 * Note: transcription is async — the script polls /tick until completed or error.
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const API_BASE = process.env.API_BASE || 'http://localhost:3001';
const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
  const schema = process.env.SUPABASE_DB_SCHEMA || 'public';
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
  return createClient(url, key, { db: { schema }, auth: { autoRefreshToken: false, persistSession: false } });
}

function getConversationsBucket(): string {
  const schema = process.env.SUPABASE_DB_SCHEMA || 'public';
  return schema !== 'public' ? 'Development_Conversations' : 'Conversations';
}

const TRANSCRIPTION_METADATA_KEYS = [
  'transcription_status',
  'transcription_error',
  'transcription_started_at',
  'transcription_completed_at',
  'assembly_id',
  'transcript_path',
  'audio_duration_ms',
] as const;

async function reset(recordingId: string) {
  console.log('🗑️  Resetting transcription data for recording:', recordingId);

  const supabase = getSupabaseClient();

  // 1. Fetch current metadata
  const { data: recording, error: recErr } = await supabase
    .from('anthology_recordings')
    .select('id, metadata')
    .eq('id', recordingId)
    .single();

  if (recErr) {
    console.error('❌ DB error fetching recording:', recErr.message);
    process.exit(1);
  }
  if (!recording) {
    console.error('❌ Recording not found:', recordingId);
    process.exit(1);
  }

  const metadata = (recording.metadata || {}) as Record<string, unknown>;
  const transcriptPath = metadata.transcript_path as string | undefined;
  const bucket = (metadata.bucket as string) || getConversationsBucket();

  // 2. Delete transcript file from storage if it exists
  if (transcriptPath) {
    console.log('   Deleting storage file:', transcriptPath);
    const { error: deleteErr } = await supabase.storage
      .from(bucket)
      .remove([transcriptPath]);

    if (deleteErr) {
      console.warn('   ⚠️  Storage delete failed:', deleteErr.message);
    } else {
      console.log('   ✅ Storage file deleted');
    }
  } else {
    console.log('   ℹ️  No transcript_path in metadata — skipping storage delete');
  }

  // 3. Clear transcription metadata fields
  const updatedMetadata = { ...metadata };
  for (const key of TRANSCRIPTION_METADATA_KEYS) {
    delete updatedMetadata[key];
  }

  const { error: updateErr } = await supabase
    .from('anthology_recordings')
    .update({ metadata: updatedMetadata })
    .eq('id', recordingId);

  if (updateErr) {
    console.error('❌ Failed to clear metadata:', updateErr.message);
    process.exit(1);
  }

  console.log('   ✅ Metadata fields cleared');
  console.log('');
  console.log('✅ Reset complete. You can now re-run:');
  console.log(`   npm run test:transcribe ${recordingId}`);
}

interface StartResponse {
  recordingId: string;
  status: string;
  assemblyId: string;
  transcriptPath: string;
}

interface TickResponse {
  recordingId: string;
  status: string;
  didWork: boolean;
  assemblyId?: string;
  assemblyStatus?: string;
  audioDurationMs?: number | null;
  transcriptPath?: string;
  error?: string;
}

interface StatusResponse {
  recordingId: string;
  status: string | null;
  assemblyId: string | null;
  transcriptPath: string | null;
  audioDurationMs: number | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error('❌ Response error:', JSON.stringify(data, null, 2));
    throw new Error(`POST ${url} failed (${response.status}): ${JSON.stringify(data)}`);
  }

  console.log('📦 Response:', JSON.stringify(data, null, 2));
  return data;
}

async function getJson(url: string) {
  const response = await fetch(url);

  const data = await response.json();

  if (!response.ok) {
    console.error('❌ Response error:', JSON.stringify(data, null, 2));
    throw new Error(`GET ${url} failed (${response.status}): ${JSON.stringify(data)}`);
  }

  console.log('📦 Response:', JSON.stringify(data, null, 2));
  return data;
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const recordingId = process.argv[2];
  const isReset = process.argv.includes('--reset');

  if (!recordingId) {
    console.error('Usage: npm run test:transcribe <recordingId>');
    console.error('       npm run test:transcribe <recordingId> -- --reset');
    console.error('');
    console.error('Example:');
    console.error('  npm run test:transcribe 123e4567-e89b-12d3-a456-426614174000');
    process.exit(1);
  }

  if (isReset) {
    await reset(recordingId);
    return;
  }

  console.log('🧪 Testing /api/transcribe');
  console.log('📝 Recording ID:', recordingId);
  console.log('🌐 API Base:', API_BASE);
  console.log('');

  try {
    // Step 1: Start the job
    console.log('⏩ Step 1: Starting transcription job...');
    const startUrl = `${API_BASE}/api/transcribe`;
    const startResponse = await postJson(startUrl, { recordingId });
    const startResult = startResponse.data as StartResponse;

    console.log('✅ Job started:');
    console.log('   Status:', startResult.status);
    console.log('   AssemblyAI ID:', startResult.assemblyId);
    console.log('   Transcript path:', startResult.transcriptPath);
    console.log('');

    // Step 2: Poll tick until completed or error
    console.log('⚙️  Step 2: Polling transcription progress...');
    const tickUrl = `${API_BASE}/api/transcribe/tick`;
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    let tickResult: TickResponse;
    let pollCount = 0;

    while (true) {
      if (Date.now() > deadline) {
        throw new Error(`Transcription timed out after ${POLL_TIMEOUT_MS / 1000}s`);
      }

      const tickResponse = await postJson(tickUrl, { recordingId });
      tickResult = tickResponse.data as TickResponse;
      pollCount++;

      console.log(`   Poll #${pollCount} — status: ${tickResult.status}${tickResult.assemblyStatus ? ` (AssemblyAI: ${tickResult.assemblyStatus})` : ''}`);

      if (tickResult.status === 'completed' || tickResult.status === 'error') {
        break;
      }

      console.log(`   ⏳ Still processing — waiting ${POLL_INTERVAL_MS / 1000}s...`);
      await sleep(POLL_INTERVAL_MS);
    }

    console.log('');
    console.log('✅ Tick finished:');
    console.log('   Status:', tickResult!.status);
    console.log('   Did work:', tickResult!.didWork);

    if (tickResult!.status === 'completed') {
      console.log('   AssemblyAI ID:', tickResult!.assemblyId);
      console.log('   Transcript path:', tickResult!.transcriptPath);
      console.log('   Audio duration (ms):', tickResult!.audioDurationMs);
    } else if (tickResult!.status === 'error') {
      console.log('   ❌ Error:', tickResult!.error);
    }
    console.log('');

    // Step 3: Check final status
    console.log('📊 Step 3: Checking final status...');
    const statusUrl = `${API_BASE}/api/transcribe/status?recordingId=${recordingId}`;
    const statusResponse = await getJson(statusUrl);
    const statusResult = statusResponse.data as StatusResponse;

    console.log('✅ Final status:');
    console.log('   Status:', statusResult.status);
    console.log('   AssemblyAI ID:', statusResult.assemblyId);
    console.log('   Transcript path:', statusResult.transcriptPath);
    console.log('   Audio duration (ms):', statusResult.audioDurationMs);
    console.log('   Started at:', statusResult.startedAt);
    console.log('   Completed at:', statusResult.completedAt);

    if (statusResult.error) {
      console.log('   ❌ Error:', statusResult.error);
    }
    console.log('');

    // Success summary
    if (statusResult.status === 'completed') {
      console.log('🎉 SUCCESS! Transcription completed successfully.');
      console.log('');
      console.log('Next steps:');
      console.log('  1. Run prepare-turns on this recording');
      console.log(`     npm run test:prepare-turns ${recordingId}`);
    } else {
      console.log('⚠️  Job did not complete successfully');
      process.exit(1);
    }

  } catch (error) {
    console.error('');
    console.error('❌ Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();

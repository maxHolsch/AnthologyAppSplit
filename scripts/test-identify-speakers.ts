#!/usr/bin/env tsx
/**
 * Test script for /api/sensemaking/identify-speakers API
 *
 * Usage:
 *   npm run test:identify-speakers <recordingId>           # run the test
 *   npm run test:identify-speakers <recordingId> -- --reset  # delete speaker data and exit
 *
 * Or with tsx directly:
 *   tsx scripts/test-identify-speakers.ts <recordingId>
 *   tsx scripts/test-identify-speakers.ts <recordingId> --reset
 *
 * Prerequisites:
 *   - Recording must have transcription_status: completed
 *   - Recording must have prepare_turns_status: completed
 *     (run npm run test:prepare-turns <recordingId> first)
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const API_BASE = process.env.API_BASE || 'http://localhost:3001';

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
  return createClient(url, key, { db: { schema: 'public' }, auth: { autoRefreshToken: false, persistSession: false } });
}

function getConversationsBucket(): string {
  return 'Conversations';
}

const IDENTIFY_SPEAKERS_METADATA_KEYS = [
  'identify_speakers_status',
  'identify_speakers_error',
  'identify_speakers_started_at',
  'identify_speakers_completed_at',
  'speaker_map_path',
  'speaker_count',
] as const;

async function reset(recordingId: string) {
  console.log('🗑️  Resetting identify-speakers data for recording:', recordingId);

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
  const speakerMapPath = metadata.speaker_map_path as string | undefined;
  const bucket = (metadata.bucket as string) || getConversationsBucket();

  // 2. Delete storage file if it exists
  if (speakerMapPath) {
    console.log('   Deleting storage file:', speakerMapPath);
    const { error: deleteErr } = await supabase.storage
      .from(bucket)
      .remove([speakerMapPath]);

    if (deleteErr) {
      console.warn('   ⚠️  Storage delete failed:', deleteErr.message);
    } else {
      console.log('   ✅ Storage file deleted');
    }
  } else {
    console.log('   ℹ️  No speaker_map_path in metadata — skipping storage delete');
  }

  // 3. Clear identify-speakers metadata fields
  const updatedMetadata = { ...metadata };
  for (const key of IDENTIFY_SPEAKERS_METADATA_KEYS) {
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
  console.log(`   npm run test:identify-speakers ${recordingId}`);
}

interface StartResponse {
  recordingId: string;
  status: string;
  speakerMapPath: string;
  mergedTurnsPath: string;
}

interface TickResponse {
  recordingId: string;
  status: string;
  didWork: boolean;
  speakerMapPath?: string;
  speakerCount?: number;
  speakers?: Record<string, { name: string; confidence: number }>;
  error?: string;
}

interface StatusResponse {
  recordingId: string;
  status: string | null;
  speakerMapPath: string | null;
  speakerCount: number | null;
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

async function main() {
  const recordingId = process.argv[2];
  const isReset = process.argv.includes('--reset');

  if (!recordingId) {
    console.error('Usage: npm run test:identify-speakers <recordingId>');
    console.error('       npm run test:identify-speakers <recordingId> -- --reset');
    console.error('');
    console.error('Example:');
    console.error('  npm run test:identify-speakers 123e4567-e89b-12d3-a456-426614174000');
    console.error('');
    console.error('Prerequisites:');
    console.error('  npm run test:prepare-turns <recordingId>');
    process.exit(1);
  }

  if (isReset) {
    await reset(recordingId);
    return;
  }

  console.log('🧪 Testing /api/sensemaking/identify-speakers');
  console.log('📝 Recording ID:', recordingId);
  console.log('🌐 API Base:', API_BASE);
  console.log('');

  try {
    // Step 1: Start the job
    console.log('⏩ Step 1: Starting identify-speakers job...');
    const startUrl = `${API_BASE}/api/sensemaking/identify-speakers`;
    const startResponse = await postJson(startUrl, { recordingId });
    const startResult = startResponse.data as StartResponse;

    console.log('✅ Job started:');
    console.log('   Status:', startResult.status);
    console.log('   Speaker map path:', startResult.speakerMapPath);
    console.log('   Merged turns path:', startResult.mergedTurnsPath);
    console.log('');

    // Step 2: Execute the work (tick) — Claude call happens here
    console.log('⚙️  Step 2: Executing identify-speakers work (calling Claude)...');
    const tickUrl = `${API_BASE}/api/sensemaking/identify-speakers/tick`;
    const tickResponse = await postJson(tickUrl, { recordingId });
    const tickResult = tickResponse.data as TickResponse;

    console.log('✅ Tick completed:');
    console.log('   Status:', tickResult.status);
    console.log('   Did work:', tickResult.didWork);

    if (tickResult.status === 'completed' && tickResult.speakers) {
      console.log('   Speaker count:', tickResult.speakerCount);
      console.log('   Identified speakers:');
      for (const [label, info] of Object.entries(tickResult.speakers)) {
        const conf = (info.confidence * 100).toFixed(0);
        console.log(`     ${label} → "${info.name}" (confidence: ${conf}%)`);
      }
    } else if (tickResult.status === 'error') {
      console.log('   ❌ Error:', tickResult.error);
    }
    console.log('');

    // Step 3: Check final status
    console.log('📊 Step 3: Checking final status...');
    const statusUrl = `${API_BASE}/api/sensemaking/identify-speakers/status?recordingId=${recordingId}`;
    const statusResponse = await getJson(statusUrl);
    const statusResult = statusResponse.data as StatusResponse;

    console.log('✅ Final status:');
    console.log('   Status:', statusResult.status);
    console.log('   Speaker count:', statusResult.speakerCount);
    console.log('   Speaker map path:', statusResult.speakerMapPath);
    console.log('   Started at:', statusResult.startedAt);
    console.log('   Completed at:', statusResult.completedAt);

    if (statusResult.error) {
      console.log('   ❌ Error:', statusResult.error);
    }
    console.log('');

    // Success summary
    if (statusResult.status === 'completed') {
      console.log('🎉 SUCCESS! Speakers identified successfully.');
      console.log('');
      console.log('Next steps:');
      console.log('  1. Assign questions to each turn');
      console.log('  2. Assign narratives to each turn');
      console.log('  3. Filter turns for quality');
      console.log('  4. Create responses in database');
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

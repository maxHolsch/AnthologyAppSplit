#!/usr/bin/env tsx
/**
 * Test script for /api/sensemaking/filter-turns API
 *
 * Usage:
 *   npm run test:filter-turns <conversationId>           # run the test
 *   npm run test:filter-turns <conversationId> -- --reset  # delete data and exit
 *
 * Or with tsx directly:
 *   tsx scripts/test-filter-turns.ts <conversationId>
 *   tsx scripts/test-filter-turns.ts <conversationId> --reset
 *
 * Prerequisites:
 *   - Conversation must have assign_narratives_status: completed
 *     (run npm run test:assign-narratives <conversationId> first)
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

const FILTER_TURNS_METADATA_KEYS = [
  'filter_turns_status',
  'filter_turns_error',
  'filter_turns_started_at',
  'filter_turns_completed_at',
  'filtered_turns_path',
  'filtered_turns_count',
] as const;

async function reset(conversationId: string) {
  console.log('🗑️  Resetting filter-turns data for conversation:', conversationId);

  const supabase = getSupabaseClient();

  const { data: conversation, error: convErr } = await supabase
    .from('anthology_conversations')
    .select('id, metadata')
    .eq('id', conversationId)
    .single();

  if (convErr) {
    console.error('❌ DB error fetching conversation:', convErr.message);
    process.exit(1);
  }
  if (!conversation) {
    console.error('❌ Conversation not found:', conversationId);
    process.exit(1);
  }

  const metadata = (conversation.metadata || {}) as Record<string, unknown>;
  const filteredTurnsPath = metadata.filtered_turns_path as string | undefined;
  const bucket = (metadata.bucket as string) || getConversationsBucket();

  if (filteredTurnsPath) {
    console.log('   Deleting storage file:', filteredTurnsPath);
    const { error: deleteErr } = await supabase.storage.from(bucket).remove([filteredTurnsPath]);
    if (deleteErr) {
      console.warn('   ⚠️  Storage delete failed:', deleteErr.message);
    } else {
      console.log('   ✅ Storage file deleted');
    }
  } else {
    console.log('   ℹ️  No filtered_turns_path in metadata — skipping storage delete');
  }

  const updatedMetadata = { ...metadata };
  for (const key of FILTER_TURNS_METADATA_KEYS) {
    delete updatedMetadata[key];
  }

  const { error: updateErr } = await supabase
    .from('anthology_conversations')
    .update({ metadata: updatedMetadata })
    .eq('id', conversationId);

  if (updateErr) {
    console.error('❌ Failed to clear metadata:', updateErr.message);
    process.exit(1);
  }

  console.log('   ✅ Metadata fields cleared');
  console.log('');
  console.log('✅ Reset complete. You can now re-run:');
  console.log(`   npm run test:filter-turns ${conversationId}`);
}

interface StartResponse {
  conversationId: string;
  status: string;
  filteredTurnsPath: string;
  assignedNarrativesPath: string;
}

interface TickResponse {
  conversationId: string;
  status: string;
  didWork: boolean;
  filteredTurnsPath?: string;
  totalTurns?: number;
  keptTurns?: number;
  error?: string;
}

interface StatusResponse {
  conversationId: string;
  status: string | null;
  filteredTurnsPath: string | null;
  filteredTurnsCount: number | null;
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
  const conversationId = process.argv[2];
  const isReset = process.argv.includes('--reset');

  if (!conversationId) {
    console.error('Usage: npm run test:filter-turns <conversationId>');
    console.error('       npm run test:filter-turns <conversationId> -- --reset');
    console.error('');
    console.error('Example:');
    console.error('  npm run test:filter-turns 123e4567-e89b-12d3-a456-426614174000');
    console.error('');
    console.error('Prerequisites:');
    console.error('  npm run test:assign-narratives <conversationId>');
    process.exit(1);
  }

  if (isReset) {
    await reset(conversationId);
    return;
  }

  console.log('🧪 Testing /api/sensemaking/filter-turns');
  console.log('📝 Conversation ID:', conversationId);
  console.log('🌐 API Base:', API_BASE);
  console.log('');

  try {
    // Step 1: Start the job
    console.log('⏩ Step 1: Starting filter-turns job...');
    const startResponse = await postJson(`${API_BASE}/api/sensemaking/filter-turns`, { conversationId });
    const startResult = startResponse.data as StartResponse;

    console.log('✅ Job started:');
    console.log('   Status:', startResult.status);
    console.log('   Filtered turns path:', startResult.filteredTurnsPath);
    console.log('');

    // Step 2: Execute the work (tick)
    console.log('⚙️  Step 2: Executing filter-turns work (calling Claude)...');
    const tickResponse = await postJson(`${API_BASE}/api/sensemaking/filter-turns/tick`, { conversationId });
    const tickResult = tickResponse.data as TickResponse;

    console.log('✅ Tick completed:');
    console.log('   Status:', tickResult.status);
    console.log('   Did work:', tickResult.didWork);
    console.log('   Total turns:', tickResult.totalTurns);
    console.log('   Kept turns:', tickResult.keptTurns);
    if (tickResult.error) console.log('   ❌ Error:', tickResult.error);
    console.log('');

    // Step 3: Check final status
    console.log('📊 Step 3: Checking final status...');
    const statusResponse = await getJson(
      `${API_BASE}/api/sensemaking/filter-turns/status?conversationId=${conversationId}`
    );
    const statusResult = statusResponse.data as StatusResponse;

    console.log('✅ Final status:');
    console.log('   Status:', statusResult.status);
    console.log('   Filtered turns count:', statusResult.filteredTurnsCount);
    console.log('   Filtered turns path:', statusResult.filteredTurnsPath);
    console.log('   Started at:', statusResult.startedAt);
    console.log('   Completed at:', statusResult.completedAt);
    if (statusResult.error) console.log('   ❌ Error:', statusResult.error);
    console.log('');

    if (statusResult.status === 'completed') {
      console.log('🎉 SUCCESS! Turns filtered successfully.');
      console.log('');
      console.log('Next step:');
      console.log(`  npm run test:create-responses ${conversationId}`);
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

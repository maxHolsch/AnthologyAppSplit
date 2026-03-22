#!/usr/bin/env tsx
/**
 * Test script for /api/sensemaking/create-responses API
 *
 * Usage:
 *   npm run test:create-responses <conversationId>           # run the test
 *   npm run test:create-responses <conversationId> -- --reset  # delete responses and exit
 *
 * Or with tsx directly:
 *   tsx scripts/test-create-responses.ts <conversationId>
 *   tsx scripts/test-create-responses.ts <conversationId> --reset
 *
 * Prerequisites:
 *   - Conversation must have filter_turns_status: completed
 *     (run npm run test:filter-turns <conversationId> first)
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const API_BASE = process.env.API_BASE || 'http://localhost:3001';

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
  const schema = process.env.SUPABASE_DB_SCHEMA || 'public';
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
  return createClient(url, key, { db: { schema }, auth: { autoRefreshToken: false, persistSession: false } });
}

const CREATE_RESPONSES_METADATA_KEYS = [
  'create_responses_status',
  'create_responses_error',
  'create_responses_started_at',
  'create_responses_completed_at',
  'response_count',
] as const;

async function reset(conversationId: string) {
  console.log('🗑️  Resetting create-responses data for conversation:', conversationId);

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

  console.log('   Deleting sensemaking responses for conversation:', conversationId);

  // Delete responses where metadata.source = 'sensemaking'
  // Supabase doesn't support JSON filtering in delete directly, so fetch IDs first
  const { data: responses, error: fetchErr } = await supabase
    .from('anthology_responses')
    .select('id, metadata')
    .eq('conversation_id', conversationId);

  if (fetchErr) {
    console.warn('   ⚠️  Failed to fetch responses:', fetchErr.message);
  } else if (responses && responses.length > 0) {
    const sensemakingIds = responses
      .filter((r: { id: string; metadata: Record<string, unknown> | null }) => {
        const m = (r.metadata || {}) as Record<string, unknown>;
        return m.source === 'sensemaking';
      })
      .map((r: { id: string }) => r.id);

    if (sensemakingIds.length > 0) {
      const { error: deleteErr, count } = await supabase
        .from('anthology_responses')
        .delete({ count: 'exact' })
        .in('id', sensemakingIds);

      if (deleteErr) {
        console.warn('   ⚠️  Failed to delete responses:', deleteErr.message);
      } else {
        console.log(`   ✅ Deleted ${count ?? sensemakingIds.length} sensemaking response(s)`);
      }
    } else {
      console.log('   ℹ️  No sensemaking responses to delete');
    }
  }

  // Clear metadata fields
  const metadata = (conversation.metadata || {}) as Record<string, unknown>;
  const updatedMetadata = { ...metadata };
  for (const key of CREATE_RESPONSES_METADATA_KEYS) {
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
  console.log(`   npm run test:create-responses ${conversationId}`);
}

interface StartResponse {
  conversationId: string;
  status: string;
  filteredTurnsPath: string;
}

interface TickResponse {
  conversationId: string;
  status: string;
  didWork: boolean;
  responseCount?: number;
  embeddingsGenerated?: boolean;
  error?: string;
}

interface StatusResponse {
  conversationId: string;
  status: string | null;
  responseCount: number | null;
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
    console.error('Usage: npm run test:create-responses <conversationId>');
    console.error('       npm run test:create-responses <conversationId> -- --reset');
    console.error('');
    console.error('Example:');
    console.error('  npm run test:create-responses 123e4567-e89b-12d3-a456-426614174000');
    console.error('');
    console.error('Prerequisites:');
    console.error('  npm run test:filter-turns <conversationId>');
    process.exit(1);
  }

  if (isReset) {
    await reset(conversationId);
    return;
  }

  console.log('🧪 Testing /api/sensemaking/create-responses');
  console.log('📝 Conversation ID:', conversationId);
  console.log('🌐 API Base:', API_BASE);
  console.log('');

  try {
    // Step 1: Start the job
    console.log('⏩ Step 1: Starting create-responses job...');
    const startResponse = await postJson(`${API_BASE}/api/sensemaking/create-responses`, { conversationId });
    const startResult = startResponse.data as StartResponse;

    console.log('✅ Job started:');
    console.log('   Status:', startResult.status);
    console.log('   Filtered turns path:', startResult.filteredTurnsPath);
    console.log('');

    // Step 2: Execute the work (tick)
    console.log('⚙️  Step 2: Executing create-responses work (DB upsert + embeddings)...');
    const tickResponse = await postJson(`${API_BASE}/api/sensemaking/create-responses/tick`, { conversationId });
    const tickResult = tickResponse.data as TickResponse;

    console.log('✅ Tick completed:');
    console.log('   Status:', tickResult.status);
    console.log('   Did work:', tickResult.didWork);
    console.log('   Response count:', tickResult.responseCount);
    console.log('   Embeddings generated:', tickResult.embeddingsGenerated);
    if (tickResult.error) console.log('   ❌ Error:', tickResult.error);
    console.log('');

    // Step 3: Check final status
    console.log('📊 Step 3: Checking final status...');
    const statusResponse = await getJson(
      `${API_BASE}/api/sensemaking/create-responses/status?conversationId=${conversationId}`
    );
    const statusResult = statusResponse.data as StatusResponse;

    console.log('✅ Final status:');
    console.log('   Status:', statusResult.status);
    console.log('   Response count:', statusResult.responseCount);
    console.log('   Started at:', statusResult.startedAt);
    console.log('   Completed at:', statusResult.completedAt);
    if (statusResult.error) console.log('   ❌ Error:', statusResult.error);
    console.log('');

    if (statusResult.status === 'completed') {
      console.log('🎉 SUCCESS! Responses created in database.');
      console.log('');
      console.log('Next step:');
      console.log(`  npm run test:set-chronological-order ${conversationId}`);
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

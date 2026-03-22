#!/usr/bin/env tsx
/**
 * Test script for /api/sensemaking/set-chronological-order API
 *
 * Usage:
 *   npm run test:set-chronological-order <conversationId>           # run the test
 *   npm run test:set-chronological-order <conversationId> -- --reset  # clear order and exit
 *
 * Or with tsx directly:
 *   tsx scripts/test-set-chronological-order.ts <conversationId>
 *   tsx scripts/test-set-chronological-order.ts <conversationId> --reset
 *
 * Prerequisites:
 *   - Conversation must have create_responses_status: completed
 *     (run npm run test:create-responses <conversationId> first)
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

const SET_CHRONOLOGICAL_ORDER_METADATA_KEYS = [
  'set_chronological_order_status',
  'set_chronological_order_error',
  'set_chronological_order_started_at',
  'set_chronological_order_completed_at',
  'chronological_response_count',
] as const;

async function reset(conversationId: string) {
  console.log('🗑️  Resetting set-chronological-order data for conversation:', conversationId);

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

  console.log('   Clearing chronological_turn_number for sensemaking responses in conversation:', conversationId);

  // Fetch sensemaking response IDs
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
      const { error: updateErr } = await supabase
        .from('anthology_responses')
        .update({ chronological_turn_number: null })
        .in('id', sensemakingIds);

      if (updateErr) {
        console.warn('   ⚠️  Failed to clear chronological_turn_number:', updateErr.message);
      } else {
        console.log(`   ✅ Cleared chronological_turn_number for ${sensemakingIds.length} response(s)`);
      }
    } else {
      console.log('   ℹ️  No sensemaking responses to reset');
    }
  }

  // Clear metadata fields
  const metadata = (conversation.metadata || {}) as Record<string, unknown>;
  const updatedMetadata = { ...metadata };
  for (const key of SET_CHRONOLOGICAL_ORDER_METADATA_KEYS) {
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
  console.log(`   npm run test:set-chronological-order ${conversationId}`);
}

interface StartResponse {
  conversationId: string;
  status: string;
}

interface TickResponse {
  conversationId: string;
  status: string;
  didWork: boolean;
  chronologicalResponseCount?: number;
  error?: string;
}

interface StatusResponse {
  conversationId: string;
  status: string | null;
  chronologicalResponseCount: number | null;
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
    console.error('Usage: npm run test:set-chronological-order <conversationId>');
    console.error('       npm run test:set-chronological-order <conversationId> -- --reset');
    console.error('');
    console.error('Example:');
    console.error('  npm run test:set-chronological-order 123e4567-e89b-12d3-a456-426614174000');
    console.error('');
    console.error('Prerequisites:');
    console.error('  npm run test:create-responses <conversationId>');
    process.exit(1);
  }

  if (isReset) {
    await reset(conversationId);
    return;
  }

  console.log('🧪 Testing /api/sensemaking/set-chronological-order');
  console.log('📝 Conversation ID:', conversationId);
  console.log('🌐 API Base:', API_BASE);
  console.log('');

  try {
    // Step 1: Start the job
    console.log('⏩ Step 1: Starting set-chronological-order job...');
    const startResponse = await postJson(`${API_BASE}/api/sensemaking/set-chronological-order`, { conversationId });
    const startResult = startResponse.data as StartResponse;

    console.log('✅ Job started:');
    console.log('   Status:', startResult.status);
    console.log('');

    // Step 2: Execute the work (tick)
    console.log('⚙️  Step 2: Executing set-chronological-order work (DB updates)...');
    const tickResponse = await postJson(`${API_BASE}/api/sensemaking/set-chronological-order/tick`, { conversationId });
    const tickResult = tickResponse.data as TickResponse;

    console.log('✅ Tick completed:');
    console.log('   Status:', tickResult.status);
    console.log('   Did work:', tickResult.didWork);
    console.log('   Chronological response count:', tickResult.chronologicalResponseCount);
    if (tickResult.error) console.log('   ❌ Error:', tickResult.error);
    console.log('');

    // Step 3: Check final status
    console.log('📊 Step 3: Checking final status...');
    const statusResponse = await getJson(
      `${API_BASE}/api/sensemaking/set-chronological-order/status?conversationId=${conversationId}`
    );
    const statusResult = statusResponse.data as StatusResponse;

    console.log('✅ Final status:');
    console.log('   Status:', statusResult.status);
    console.log('   Chronological response count:', statusResult.chronologicalResponseCount);
    console.log('   Started at:', statusResult.startedAt);
    console.log('   Completed at:', statusResult.completedAt);
    if (statusResult.error) console.log('   ❌ Error:', statusResult.error);
    console.log('');

    if (statusResult.status === 'completed') {
      console.log('🎉 SUCCESS! Sensemaking pipeline complete!');
      console.log('');
      console.log('Full pipeline summary:');
      console.log('  ✅ Transcription');
      console.log('  ✅ Prepare turns');
      console.log('  ✅ Identify speakers');
      console.log('  ✅ Create conversation');
      console.log('  ✅ Assign questions');
      console.log('  ✅ Assign narratives');
      console.log('  ✅ Filter turns');
      console.log('  ✅ Create responses');
      console.log('  ✅ Set chronological order');
      console.log('');
      console.log(`  Conversation ID: ${conversationId}`);
      console.log(`  Responses created: ${statusResult.chronologicalResponseCount}`);
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

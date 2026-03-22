#!/usr/bin/env tsx
/**
 * Test script for /api/sensemaking/assign-narratives API
 *
 * Usage:
 *   npm run test:assign-narratives <conversationId>           # run the test
 *   npm run test:assign-narratives <conversationId> -- --reset  # delete data and exit
 *
 * Or with tsx directly:
 *   tsx scripts/test-assign-narratives.ts <conversationId>
 *   tsx scripts/test-assign-narratives.ts <conversationId> --reset
 *
 * Prerequisites:
 *   - Conversation must have assign_questions_status: completed
 *     (run npm run test:assign-questions <conversationId> first)
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

function getConversationsBucket(): string {
  const schema = process.env.SUPABASE_DB_SCHEMA || 'public';
  return schema !== 'public' ? 'Development_Conversations' : 'Conversations';
}

const ASSIGN_NARRATIVES_METADATA_KEYS = [
  'assign_narratives_status',
  'assign_narratives_error',
  'assign_narratives_started_at',
  'assign_narratives_completed_at',
  'assigned_narratives_path',
  'assign_narratives_turn_count',
] as const;

async function reset(conversationId: string) {
  console.log('🗑️  Resetting assign-narratives data for conversation:', conversationId);

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
  const assignedNarrativesPath = metadata.assigned_narratives_path as string | undefined;
  const bucket = (metadata.bucket as string) || getConversationsBucket();

  if (assignedNarrativesPath) {
    console.log('   Deleting storage file:', assignedNarrativesPath);
    const { error: deleteErr } = await supabase.storage.from(bucket).remove([assignedNarrativesPath]);
    if (deleteErr) {
      console.warn('   ⚠️  Storage delete failed:', deleteErr.message);
    } else {
      console.log('   ✅ Storage file deleted');
    }
  } else {
    console.log('   ℹ️  No assigned_narratives_path in metadata — skipping storage delete');
  }

  const updatedMetadata = { ...metadata };
  for (const key of ASSIGN_NARRATIVES_METADATA_KEYS) {
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
  console.log(`   npm run test:assign-narratives ${conversationId}`);
}

interface StartResponse {
  conversationId: string;
  status: string;
  assignedNarrativesPath: string;
  assignedQuestionsPath: string;
}

interface TickResponse {
  conversationId: string;
  status: string;
  didWork: boolean;
  assignedNarrativesPath?: string;
  turnCount?: number;
  narrativeCount?: number;
  usedEmbeddings?: boolean;
  error?: string;
}

interface StatusResponse {
  conversationId: string;
  status: string | null;
  assignedNarrativesPath: string | null;
  turnCount: number | null;
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
    console.error('Usage: npm run test:assign-narratives <conversationId>');
    console.error('       npm run test:assign-narratives <conversationId> -- --reset');
    console.error('');
    console.error('Example:');
    console.error('  npm run test:assign-narratives 123e4567-e89b-12d3-a456-426614174000');
    console.error('');
    console.error('Prerequisites:');
    console.error('  npm run test:assign-questions <conversationId>');
    process.exit(1);
  }

  if (isReset) {
    await reset(conversationId);
    return;
  }

  console.log('🧪 Testing /api/sensemaking/assign-narratives');
  console.log('📝 Conversation ID:', conversationId);
  console.log('🌐 API Base:', API_BASE);
  console.log('');

  try {
    // Step 1: Start the job
    console.log('⏩ Step 1: Starting assign-narratives job...');
    const startResponse = await postJson(`${API_BASE}/api/sensemaking/assign-narratives`, { conversationId });
    const startResult = startResponse.data as StartResponse;

    console.log('✅ Job started:');
    console.log('   Status:', startResult.status);
    console.log('   Assigned narratives path:', startResult.assignedNarrativesPath);
    console.log('');

    // Step 2: Execute the work (tick)
    console.log('⚙️  Step 2: Executing assign-narratives work (embedding similarity)...');
    const tickResponse = await postJson(`${API_BASE}/api/sensemaking/assign-narratives/tick`, { conversationId });
    const tickResult = tickResponse.data as TickResponse;

    console.log('✅ Tick completed:');
    console.log('   Status:', tickResult.status);
    console.log('   Did work:', tickResult.didWork);
    console.log('   Turn count:', tickResult.turnCount);
    console.log('   Narrative count:', tickResult.narrativeCount);
    console.log('   Used embeddings:', tickResult.usedEmbeddings);
    if (tickResult.error) console.log('   ❌ Error:', tickResult.error);
    console.log('');

    // Step 3: Check final status
    console.log('📊 Step 3: Checking final status...');
    const statusResponse = await getJson(
      `${API_BASE}/api/sensemaking/assign-narratives/status?conversationId=${conversationId}`
    );
    const statusResult = statusResponse.data as StatusResponse;

    console.log('✅ Final status:');
    console.log('   Status:', statusResult.status);
    console.log('   Turn count:', statusResult.turnCount);
    console.log('   Assigned narratives path:', statusResult.assignedNarrativesPath);
    console.log('   Started at:', statusResult.startedAt);
    console.log('   Completed at:', statusResult.completedAt);
    if (statusResult.error) console.log('   ❌ Error:', statusResult.error);
    console.log('');

    if (statusResult.status === 'completed') {
      console.log('🎉 SUCCESS! Narratives assigned to turns.');
      console.log('');
      console.log('Next step:');
      console.log(`  npm run test:filter-turns ${conversationId}`);
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

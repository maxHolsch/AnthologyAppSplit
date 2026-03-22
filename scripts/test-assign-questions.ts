#!/usr/bin/env tsx
/**
 * Test script for /api/sensemaking/assign-questions API
 *
 * Usage:
 *   npm run test:assign-questions <conversationId>           # run the test
 *   npm run test:assign-questions <conversationId> -- --reset  # delete data and exit
 *
 * Or with tsx directly:
 *   tsx scripts/test-assign-questions.ts <conversationId>
 *   tsx scripts/test-assign-questions.ts <conversationId> --reset
 *
 * Prerequisites:
 *   - Conversation must exist with questions created
 *     (run npm run test:create-conversation <recordingId> first)
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

const ASSIGN_QUESTIONS_METADATA_KEYS = [
  'assign_questions_status',
  'assign_questions_error',
  'assign_questions_started_at',
  'assign_questions_completed_at',
  'assigned_questions_path',
  'assign_questions_turn_count',
] as const;

async function reset(conversationId: string) {
  console.log('🗑️  Resetting assign-questions data for conversation:', conversationId);

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
  const assignedQuestionsPath = metadata.assigned_questions_path as string | undefined;
  const bucket = (metadata.bucket as string) || getConversationsBucket();

  if (assignedQuestionsPath) {
    console.log('   Deleting storage file:', assignedQuestionsPath);
    const { error: deleteErr } = await supabase.storage.from(bucket).remove([assignedQuestionsPath]);
    if (deleteErr) {
      console.warn('   ⚠️  Storage delete failed:', deleteErr.message);
    } else {
      console.log('   ✅ Storage file deleted');
    }
  } else {
    console.log('   ℹ️  No assigned_questions_path in metadata — skipping storage delete');
  }

  const updatedMetadata = { ...metadata };
  for (const key of ASSIGN_QUESTIONS_METADATA_KEYS) {
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
  console.log(`   npm run test:assign-questions ${conversationId}`);
}

interface StartResponse {
  conversationId: string;
  status: string;
  assignedQuestionsPath: string;
  mergedTurnsPath: string;
}

interface TickResponse {
  conversationId: string;
  status: string;
  didWork: boolean;
  assignedQuestionsPath?: string;
  turnCount?: number;
  questionCount?: number;
  error?: string;
}

interface StatusResponse {
  conversationId: string;
  status: string | null;
  assignedQuestionsPath: string | null;
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
    console.error('Usage: npm run test:assign-questions <conversationId>');
    console.error('       npm run test:assign-questions <conversationId> -- --reset');
    console.error('');
    console.error('Example:');
    console.error('  npm run test:assign-questions 123e4567-e89b-12d3-a456-426614174000');
    console.error('');
    console.error('Prerequisites:');
    console.error('  npm run test:create-conversation <recordingId>');
    process.exit(1);
  }

  if (isReset) {
    await reset(conversationId);
    return;
  }

  console.log('🧪 Testing /api/sensemaking/assign-questions');
  console.log('📝 Conversation ID:', conversationId);
  console.log('🌐 API Base:', API_BASE);
  console.log('');

  try {
    // Step 1: Start the job
    console.log('⏩ Step 1: Starting assign-questions job...');
    const startResponse = await postJson(`${API_BASE}/api/sensemaking/assign-questions`, { conversationId });
    const startResult = startResponse.data as StartResponse;

    console.log('✅ Job started:');
    console.log('   Status:', startResult.status);
    console.log('   Assigned questions path:', startResult.assignedQuestionsPath);
    console.log('');

    // Step 2: Execute the work (tick)
    console.log('⚙️  Step 2: Executing assign-questions work (calling Claude)...');
    const tickResponse = await postJson(`${API_BASE}/api/sensemaking/assign-questions/tick`, { conversationId });
    const tickResult = tickResponse.data as TickResponse;

    console.log('✅ Tick completed:');
    console.log('   Status:', tickResult.status);
    console.log('   Did work:', tickResult.didWork);
    console.log('   Turn count:', tickResult.turnCount);
    console.log('   Question count:', tickResult.questionCount);
    if (tickResult.error) console.log('   ❌ Error:', tickResult.error);
    console.log('');

    // Step 3: Check final status
    console.log('📊 Step 3: Checking final status...');
    const statusResponse = await getJson(
      `${API_BASE}/api/sensemaking/assign-questions/status?conversationId=${conversationId}`
    );
    const statusResult = statusResponse.data as StatusResponse;

    console.log('✅ Final status:');
    console.log('   Status:', statusResult.status);
    console.log('   Turn count:', statusResult.turnCount);
    console.log('   Assigned questions path:', statusResult.assignedQuestionsPath);
    console.log('   Started at:', statusResult.startedAt);
    console.log('   Completed at:', statusResult.completedAt);
    if (statusResult.error) console.log('   ❌ Error:', statusResult.error);
    console.log('');

    if (statusResult.status === 'completed') {
      console.log('🎉 SUCCESS! Questions assigned to turns.');
      console.log('');
      console.log('Next step:');
      console.log(`  npm run test:assign-narratives ${conversationId}`);
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

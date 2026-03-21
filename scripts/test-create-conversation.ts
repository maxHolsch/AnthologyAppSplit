#!/usr/bin/env tsx
/**
 * Test script for /api/sensemaking/create-conversation API
 *
 * Usage:
 *   npm run test:create-conversation <recordingId>           # run the test
 *   npm run test:create-conversation <recordingId> -- --reset  # delete created data and exit
 *
 * Or with tsx directly:
 *   tsx scripts/test-create-conversation.ts <recordingId>
 *   tsx scripts/test-create-conversation.ts <recordingId> --reset
 *
 * Prerequisites:
 *   - Recording must have identify_speakers_status: completed
 *     (run npm run test:identify-speakers <recordingId> first)
 *
 * Options:
 *   --questions "Q1" "Q2"   Question texts to create (default: two example questions)
 *   --narratives "N1" "N2"  Narrative texts to create (default: two example narratives)
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

const CREATE_CONVERSATION_METADATA_KEYS = [
  'conversation_id',
  'create_conversation_status',
  'create_conversation_completed_at',
] as const;

async function reset(recordingId: string) {
  console.log('🗑️  Resetting create-conversation data for recording:', recordingId);

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
  const conversationId = metadata.conversation_id as string | undefined;

  if (!conversationId) {
    console.log('   ℹ️  No conversation_id in metadata — nothing to delete');
  } else {
    console.log('   Conversation ID to delete:', conversationId);

    // 2. Delete responses
    const { error: respErr, count: respCount } = await supabase
      .from('anthology_responses')
      .delete({ count: 'exact' })
      .eq('conversation_id', conversationId);

    if (respErr) {
      console.warn('   ⚠️  Failed to delete responses:', respErr.message);
    } else {
      console.log(`   ✅ Deleted ${respCount ?? 0} response(s)`);
    }

    // 3. Delete speakers
    const { error: spErr, count: spCount } = await supabase
      .from('anthology_speakers')
      .delete({ count: 'exact' })
      .eq('conversation_id', conversationId);

    if (spErr) {
      console.warn('   ⚠️  Failed to delete speakers:', spErr.message);
    } else {
      console.log(`   ✅ Deleted ${spCount ?? 0} speaker(s)`);
    }

    // 4. Delete questions
    const { error: qErr, count: qCount } = await supabase
      .from('anthology_questions')
      .delete({ count: 'exact' })
      .eq('conversation_id', conversationId);

    if (qErr) {
      console.warn('   ⚠️  Failed to delete questions:', qErr.message);
    } else {
      console.log(`   ✅ Deleted ${qCount ?? 0} question(s)`);
    }

    // 5. Delete narratives
    const { error: nErr, count: nCount } = await supabase
      .from('anthology_narratives')
      .delete({ count: 'exact' })
      .eq('conversation_id', conversationId);

    if (nErr) {
      console.warn('   ⚠️  Failed to delete narratives:', nErr.message);
    } else {
      console.log(`   ✅ Deleted ${nCount ?? 0} narrative(s)`);
    }

    // 6. Delete conversation_recordings link
    const { error: linkErr } = await supabase
      .from('anthology_conversation_recordings')
      .delete()
      .eq('conversation_id', conversationId);

    if (linkErr) {
      console.warn('   ⚠️  Failed to delete conversation_recordings link:', linkErr.message);
    } else {
      console.log('   ✅ Deleted conversation_recordings link');
    }

    // 7. Delete conversation
    const { error: convErr } = await supabase
      .from('anthology_conversations')
      .delete()
      .eq('id', conversationId);

    if (convErr) {
      console.error('❌ Failed to delete conversation:', convErr.message);
      process.exit(1);
    } else {
      console.log('   ✅ Deleted conversation');
    }
  }

  // 8. Clear create-conversation metadata fields
  const updatedMetadata = { ...metadata };
  for (const key of CREATE_CONVERSATION_METADATA_KEYS) {
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
  console.log(`   npm run test:create-conversation ${recordingId}`);
}

interface CreateConversationResponse {
  recordingId: string;
  status: string;
  didWork: boolean;
  conversationId?: string;
  speakerCount?: number;
  questionCount?: number;
  narrativeCount?: number;
  speakerDbIds?: Record<string, string>;
  questionDbIds?: string[];
  narrativeDbIds?: string[];
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

function parseListArgs(flag: string): string[] {
  const args = process.argv.slice(3);
  const idx = args.indexOf(flag);
  if (idx === -1) return [];
  const values: string[] = [];
  for (let i = idx + 1; i < args.length; i++) {
    if (args[i].startsWith('--')) break;
    values.push(args[i]);
  }
  return values;
}

async function main() {
  const recordingId = process.argv[2];
  const isReset = process.argv.includes('--reset');

  if (!recordingId) {
    console.error('Usage: npm run test:create-conversation <recordingId>');
    console.error('       npm run test:create-conversation <recordingId> -- --reset');
    console.error('');
    console.error('Example:');
    console.error('  npm run test:create-conversation 123e4567-e89b-12d3-a456-426614174000');
    console.error('');
    console.error('Prerequisites:');
    console.error('  npm run test:identify-speakers <recordingId>');
    process.exit(1);
  }

  if (isReset) {
    await reset(recordingId);
    return;
  }

  const questions = parseListArgs('--questions').length > 0
    ? parseListArgs('--questions')
    : ['What brought you here today?', 'What has been your biggest challenge?'];

  const narratives = parseListArgs('--narratives').length > 0
    ? parseListArgs('--narratives')
    : ['Community and belonging', 'Overcoming adversity'];

  console.log('🧪 Testing /api/sensemaking/create-conversation');
  console.log('📝 Recording ID:', recordingId);
  console.log('🌐 API Base:', API_BASE);
  console.log('❓ Questions:', questions);
  console.log('📖 Narratives:', narratives);
  console.log('');

  try {
    console.log('⏩ Calling create-conversation...');
    const url = `${API_BASE}/api/sensemaking/create-conversation`;
    const response = await postJson(url, { recordingId, questions, narratives });
    const result = response.data as CreateConversationResponse;

    console.log('');
    if (result.didWork === false) {
      console.log('ℹ️  Conversation already existed (idempotent return):');
      console.log('   Conversation ID:', result.conversationId);
    } else {
      console.log('✅ Conversation skeleton created:');
      console.log('   Conversation ID:', result.conversationId);
      console.log('   Speakers created:', result.speakerCount);
      console.log('   Questions created:', result.questionCount);
      console.log('   Narratives created:', result.narrativeCount, '(includes auto-created "Misc")');

      if (result.speakerDbIds && Object.keys(result.speakerDbIds).length > 0) {
        console.log('   Speaker IDs:');
        for (const [label, id] of Object.entries(result.speakerDbIds)) {
          console.log(`     ${label} → ${id}`);
        }
      }

      if (result.questionDbIds && result.questionDbIds.length > 0) {
        console.log('   Question IDs:', result.questionDbIds.join(', '));
      }

      if (result.narrativeDbIds && result.narrativeDbIds.length > 0) {
        console.log('   Narrative IDs:', result.narrativeDbIds.join(', '));
      }
    }

    console.log('');
    console.log('🎉 SUCCESS! Conversation skeleton created.');
    console.log('');
    console.log('To clean up:');
    console.log(`  npm run test:create-conversation ${recordingId} -- --reset`);

  } catch (error) {
    console.error('');
    console.error('❌ Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();

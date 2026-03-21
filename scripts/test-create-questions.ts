#!/usr/bin/env tsx
/**
 * Test script for POST /api/questions
 *
 * Usage:
 *   npm run test:create-questions <conversationId> "Question 1" "Question 2" ...
 *   npm run test:create-questions <conversationId> -- --reset
 *
 * Or with tsx directly:
 *   tsx scripts/test-create-questions.ts <conversationId> "Question 1" "Question 2"
 *   tsx scripts/test-create-questions.ts <conversationId> --reset
 *
 * Prerequisites:
 *   - Conversation must exist in the database
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

async function reset(conversationId: string) {
  console.log('🗑️  Resetting questions for conversation:', conversationId);

  const supabase = getSupabaseClient();

  const { error, count } = await supabase
    .from('anthology_questions')
    .delete({ count: 'exact' })
    .eq('conversation_id', conversationId);

  if (error) {
    console.error('❌ Failed to delete questions:', error.message);
    process.exit(1);
  }

  console.log(`   ✅ Deleted ${count ?? 0} question(s)`);
  console.log('');
  console.log('✅ Reset complete. You can now re-run:');
  console.log(`   npm run test:create-questions ${conversationId} "Question 1" "Question 2"`);
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

  return data;
}

async function main() {
  const conversationId = process.argv[2];
  const isReset = process.argv.includes('--reset');

  if (!conversationId) {
    console.error('Usage: npm run test:create-questions <conversationId> "Question 1" "Question 2"');
    console.error('       npm run test:create-questions <conversationId> -- --reset');
    console.error('');
    console.error('Example:');
    console.error('  npm run test:create-questions 123e4567-e89b-12d3-a456-426614174000 "What brought you here?" "What challenges have you faced?"');
    process.exit(1);
  }

  if (isReset) {
    await reset(conversationId);
    return;
  }

  const questionTexts = process.argv.slice(3).filter(a => !a.startsWith('--'));

  if (questionTexts.length === 0) {
    console.error('❌ At least one question text is required');
    console.error('Usage: npm run test:create-questions <conversationId> "Question 1" "Question 2"');
    process.exit(1);
  }

  console.log('🧪 Testing POST /api/questions');
  console.log('💬 Conversation ID:', conversationId);
  console.log('🌐 API Base:', API_BASE);
  console.log('❓ Questions to create:', questionTexts.length);
  console.log('');

  const createdIds: string[] = [];

  for (const [i, questionText] of questionTexts.entries()) {
    console.log(`⏩ Creating question ${i + 1}/${questionTexts.length}: "${questionText}"`);

    const response = await postJson(`${API_BASE}/api/questions`, {
      conversationId,
      questionText,
    });

    const question = response.data;
    createdIds.push(question.id);
    console.log(`   ✅ Created: ${question.id}`);
  }

  console.log('');
  console.log(`🎉 SUCCESS! Created ${createdIds.length} question(s).`);
  console.log('   IDs:', createdIds.join(', '));
  console.log('');
  console.log('To clean up:');
  console.log(`  npm run test:create-questions ${conversationId} -- --reset`);
}

main().catch((error) => {
  console.error('❌ Error:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});

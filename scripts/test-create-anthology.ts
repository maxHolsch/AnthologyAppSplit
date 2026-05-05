#!/usr/bin/env tsx
/**
 * Test script for POST /api/anthologies
 *
 * Usage:
 *   npm run test:create-anthology "<title>"              # create a new anthology
 *   npm run test:create-anthology <slug> -- --reset      # wipe ALL data for that anthology
 *
 * Or with tsx directly:
 *   tsx scripts/test-create-anthology.ts "My Anthology"
 *   tsx scripts/test-create-anthology.ts my-anthology --reset
 *
 * --reset deletes (in order):
 *   - All storage files referenced by recordings (audio, transcript, turns, speaker map)
 *   - All files in upload_conversations/<slug>/ folder in the bucket
 *   - anthology_word_timestamps
 *   - anthology_responses
 *   - anthology_questions
 *   - anthology_narratives
 *   - anthology_speakers
 *   - anthology_conversation_recordings
 *   - anthology_recordings
 *   - anthology_conversations
 *   - anthology_sensemaking_jobs
 *   - anthology_anthologies (the row itself)
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

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------

async function reset(slug: string) {
  console.log('🗑️  Resetting all data for anthology slug:', slug);
  console.log('');

  const supabase = getSupabaseClient();

  // 1. Resolve anthology
  const { data: anthology, error: anthErr } = await supabase
    .from('anthology_anthologies')
    .select('id, title, slug')
    .eq('slug', slug)
    .single();

  if (anthErr || !anthology) {
    console.error('❌ Anthology not found for slug:', slug);
    process.exit(1);
  }

  const anthologyId = anthology.id as string;
  console.log(`   Found anthology: "${anthology.title}" (${anthologyId})`);
  console.log('');

  // 2. Load conversations
  const { data: conversations } = await supabase
    .from('anthology_conversations')
    .select('id')
    .eq('anthology_id', anthologyId);

  const conversationIds = (conversations || []).map((c: any) => c.id as string);
  console.log(`   Conversations: ${conversationIds.length}`);

  // 3. Load all recordings for this anthology directly (not just via junction table)
  const defaultBucket = getConversationsBucket();
  let recordingIds: string[] = [];
  let storagePaths: { bucket: string; path: string }[] = [];

  const { data: recordings } = await supabase
    .from('anthology_recordings')
    .select('id, metadata')
    .eq('anthology_id', anthologyId);

  recordingIds = (recordings || []).map((r: any) => r.id as string);
  console.log(`   Recordings: ${recordingIds.length}`);

  for (const rec of recordings || []) {
    const meta = (rec.metadata || {}) as Record<string, unknown>;
    const bucket = (meta.bucket as string) || defaultBucket;

    for (const key of ['object_path', 'transcript_path', 'merged_turns_path', 'speaker_map_path'] as const) {
      const p = meta[key] as string | undefined;
      if (p) storagePaths.push({ bucket, path: p });
    }
  }

  console.log(`   Storage files to delete: ${storagePaths.length}`);
  console.log('');

  // 4. Delete storage files
  if (storagePaths.length > 0) {
    console.log('📦 Deleting storage files...');

    // Group by bucket
    const byBucket = new Map<string, string[]>();
    for (const { bucket, path } of storagePaths) {
      const existing = byBucket.get(bucket) || [];
      existing.push(path);
      byBucket.set(bucket, existing);
    }

    for (const [bucket, paths] of byBucket.entries()) {
      console.log(`   Bucket "${bucket}": deleting ${paths.length} file(s)`);
      const { error: storageErr } = await supabase.storage.from(bucket).remove(paths);
      if (storageErr) {
        console.warn(`   ⚠️  Storage delete error: ${storageErr.message}`);
      } else {
        console.log(`   ✅ Deleted`);
      }
    }
    console.log('');
  }

  // 5. Delete the upload_conversations/<slug>/ folder in storage (catches any files not in metadata)
  console.log(`📦 Clearing upload_conversations/${slug}/ folder in "${defaultBucket}"...`);
  const { data: folderFiles, error: listErr } = await supabase.storage
    .from(defaultBucket)
    .list(`upload_conversations/${slug}`, { limit: 1000 });

  if (listErr) {
    console.warn(`   ⚠️  Could not list folder: ${listErr.message}`);
  } else if (folderFiles && folderFiles.length > 0) {
    const folderPaths = folderFiles.map((f: any) => `upload_conversations/${slug}/${f.name}`);
    console.log(`   Deleting ${folderPaths.length} file(s) from folder`);
    const { error: folderDeleteErr } = await supabase.storage.from(defaultBucket).remove(folderPaths);
    if (folderDeleteErr) {
      console.warn(`   ⚠️  Folder delete error: ${folderDeleteErr.message}`);
    } else {
      console.log(`   ✅ Folder cleared`);
    }
  } else {
    console.log(`   (folder empty or not found)`);
  }
  console.log('');

  // 6. Delete child DB rows (deepest first)

  if (conversationIds.length > 0) {
    // word_timestamps → via response IDs
    const { data: responses } = await supabase
      .from('anthology_responses')
      .select('id')
      .in('conversation_id', conversationIds);

    const responseIds = (responses || []).map((r: any) => r.id as string);

    if (responseIds.length > 0) {
      await deleteRows(supabase, 'anthology_word_timestamps', 'response_id', responseIds);
    }

    await deleteRows(supabase, 'anthology_responses', 'conversation_id', conversationIds);
    await deleteRows(supabase, 'anthology_questions', 'conversation_id', conversationIds);
    await deleteRows(supabase, 'anthology_narratives', 'conversation_id', conversationIds);
    await deleteRows(supabase, 'anthology_speakers', 'conversation_id', conversationIds);
    await deleteRows(supabase, 'anthology_conversation_recordings', 'conversation_id', conversationIds);
  }

  if (recordingIds.length > 0) {
    await deleteRows(supabase, 'anthology_recordings', 'id', recordingIds);
  }

  if (conversationIds.length > 0) {
    await deleteRows(supabase, 'anthology_conversations', 'anthology_id', [anthologyId]);
  }

  // sensemaking jobs
  await deleteRows(supabase, 'anthology_sensemaking_jobs', 'anthology_id', [anthologyId]);

  // Finally, delete the anthology itself
  console.log('🗑️  Deleting anthology_anthologies row...');
  const { error: anthDeleteErr } = await supabase
    .from('anthology_anthologies')
    .delete()
    .eq('id', anthologyId);

  if (anthDeleteErr) {
    console.error('❌ Failed to delete anthology:', anthDeleteErr.message);
    process.exit(1);
  }
  console.log('   ✅ Anthology deleted');
  console.log('');
  console.log(`✅ Reset complete. All data for "${anthology.title}" has been removed.`);
}

async function deleteRows(
  supabase: ReturnType<typeof getSupabaseClient>,
  table: string,
  column: string,
  ids: string[],
) {
  if (ids.length === 0) return;

  console.log(`🗑️  Deleting from ${table} (${column} in [${ids.length}])...`);

  const { error, count } = await supabase
    .from(table)
    .delete({ count: 'exact' })
    .in(column, ids);

  if (error) {
    console.warn(`   ⚠️  Error: ${error.message}`);
  } else {
    console.log(`   ✅ Deleted ${count ?? '?'} row(s)`);
  }
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

interface CreateAnthologyResponse {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  isPublic: boolean;
  createdAt: string;
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

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const arg = process.argv[2];
  const isReset = process.argv.includes('--reset');

  if (!arg) {
    console.error('Usage:');
    console.error('  npm run test:create-anthology "<title>"           # create anthology');
    console.error('  npm run test:create-anthology <slug> -- --reset  # wipe all data');
    console.error('');
    console.error('Examples:');
    console.error('  npm run test:create-anthology "My Anthology"');
    console.error('  npm run test:create-anthology my-anthology -- --reset');
    process.exit(1);
  }

  if (isReset) {
    await reset(arg);
    return;
  }

  const title = arg;

  console.log('🧪 Testing POST /api/anthologies');
  console.log('📝 Title:', title);
  console.log('🌐 API Base:', API_BASE);
  console.log('');

  try {
    console.log('⏩ Creating anthology...');
    const response = await postJson(`${API_BASE}/api/anthologies`, { title });
    const result = response.data as CreateAnthologyResponse;

    console.log('');
    console.log('✅ Anthology created:');
    console.log('   ID:        ', result.id);
    console.log('   Slug:      ', result.slug);
    console.log('   Title:     ', result.title);
    console.log('   Is public: ', result.isPublic);
    console.log('   Created at:', result.createdAt);
    console.log('');
    console.log('Next steps:');
    console.log(`  Upload a recording: POST /api/anthologies/${result.slug}/upload`);
    console.log(`  Reset when done:    npm run test:create-anthology ${result.slug} -- --reset`);
  } catch (error) {
    console.error('');
    console.error('❌ Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();

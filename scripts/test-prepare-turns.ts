#!/usr/bin/env tsx
/**
 * Test script for /api/sensemaking/prepare-turns API
 *
 * Usage:
 *   npm run test:prepare-turns <recordingId>
 *
 * Or with tsx directly:
 *   tsx scripts/test-prepare-turns.ts <recordingId>
 */

const API_BASE = process.env.API_BASE || 'http://localhost:3001';

interface StartResponse {
  recordingId: string;
  status: string;
  mergedTurnsPath: string;
  utteranceCount: number;
}

interface TickResponse {
  recordingId: string;
  status: string;
  didWork: boolean;
  mergedTurnsPath?: string;
  turnCount?: number;
  originalUtteranceCount?: number;
  error?: string;
}

interface StatusResponse {
  recordingId: string;
  status: string | null;
  mergedTurnsPath: string | null;
  turnCount: number | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

async function postJson(url: string, body: any) {
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

  if (!recordingId) {
    console.error('Usage: npm run test:prepare-turns <recordingId>');
    console.error('');
    console.error('Example:');
    console.error('  npm run test:prepare-turns 123e4567-e89b-12d3-a456-426614174000');
    process.exit(1);
  }

  console.log('🧪 Testing /api/sensemaking/prepare-turns');
  console.log('📝 Recording ID:', recordingId);
  console.log('🌐 API Base:', API_BASE);
  console.log('');

  try {
    // Step 1: Start the job
    console.log('⏩ Step 1: Starting prepare-turns job...');
    const startUrl = `${API_BASE}/api/sensemaking/prepare-turns`;
    const startResponse = await postJson(startUrl, { recordingId });
    const startResult = startResponse.data as StartResponse;

    console.log('✅ Job started:');
    console.log('   Status:', startResult.status);
    console.log('   Merged turns path:', startResult.mergedTurnsPath);
    console.log('   Utterance count:', startResult.utteranceCount);
    console.log('');

    // Step 2: Execute the work (tick)
    console.log('⚙️  Step 2: Executing prepare-turns work...');
    const tickUrl = `${API_BASE}/api/sensemaking/prepare-turns/tick`;
    const tickResponse = await postJson(tickUrl, { recordingId });
    const tickResult = tickResponse.data as TickResponse;

    console.log('✅ Tick completed:');
    console.log('   Status:', tickResult.status);
    console.log('   Did work:', tickResult.didWork);

    if (tickResult.status === 'completed') {
      console.log('   Turn count:', tickResult.turnCount);
      console.log('   Original utterances:', tickResult.originalUtteranceCount);
      if (tickResult.turnCount && tickResult.originalUtteranceCount) {
        console.log('   Reduction:',
          `${tickResult.originalUtteranceCount} → ${tickResult.turnCount}`,
          `(${Math.round((1 - (tickResult.turnCount / tickResult.originalUtteranceCount)) * 100)}% reduction)`
        );
      }
    } else if (tickResult.status === 'error') {
      console.log('   ❌ Error:', tickResult.error);
    }
    console.log('');

    // Step 3: Check final status
    console.log('📊 Step 3: Checking final status...');
    const statusUrl = `${API_BASE}/api/sensemaking/prepare-turns/status?recordingId=${recordingId}`;
    const statusResponse = await getJson(statusUrl);
    const statusResult = statusResponse.data as StatusResponse;

    console.log('✅ Final status:');
    console.log('   Status:', statusResult.status);
    console.log('   Turn count:', statusResult.turnCount);
    console.log('   Started at:', statusResult.startedAt);
    console.log('   Completed at:', statusResult.completedAt);

    if (statusResult.error) {
      console.log('   ❌ Error:', statusResult.error);
    }
    console.log('');

    // Success summary
    if (statusResult.status === 'completed') {
      console.log('🎉 SUCCESS! Turns prepared successfully.');
      console.log('');
      console.log('Next steps:');
      console.log('  1. Run speaker identification on these turns');
      console.log('  2. Assign questions to each turn');
      console.log('  3. Assign narratives to each turn');
      console.log('  4. Filter turns for quality');
      console.log('  5. Create responses in database');
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

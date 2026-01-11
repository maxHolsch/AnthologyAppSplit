/**
 * Migration Script: Update Hearst Anthology with Theme/Narrative Structure
 *
 * This script:
 * 1. Reads the manually edited transcript JSON
 * 2. Maps existing responses to new excerpts
 * 3. Splits responses where needed
 * 4. Adds theme and narrative metadata
 * 5. Updates embeddings as needed
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { config } from 'dotenv';
import * as readline from 'readline';

// Load environment variables from .env file
config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing Supabase credentials in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Types
interface Excerpt {
  id: string;
  speaker: string;
  text: string;
  question_id: string;
  theme_ids: string[];
  narrative_ids: string[];
  page: number;
}

interface Theme {
  id: string;
  name: string;
  description: string;
}

interface Narrative {
  id: string;
  name: string;
  description: string;
  related_themes: string[];
}

interface TranscriptAnalysis {
  metadata: any;
  facilitator_questions: any[];
  themes: Theme[];
  narratives: Narrative[];
  excerpts: Excerpt[];
}

interface ExistingResponse {
  id: string;
  legacy_id: string;
  speaker_name: string;
  speaker_text: string;
  responds_to_question_id: string;
  conversation_id: string;
  embedding: number[] | null;
  metadata: any;
  audio_start_ms: number;
  audio_end_ms: number;
}

// Utility: Calculate text similarity (simple Jaccard similarity)
function textSimilarity(text1: string, text2: string): number {
  const normalize = (text: string) =>
    text.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 3); // Only words longer than 3 chars

  const words1 = new Set(normalize(text1));
  const words2 = new Set(normalize(text2));

  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

// Utility: Find best matching existing response for an excerpt
function findBestMatch(
  excerpt: Excerpt,
  existingResponses: ExistingResponse[]
): { response: ExistingResponse; similarity: number } | null {
  let bestMatch: ExistingResponse | null = null;
  let bestSimilarity = 0;

  for (const response of existingResponses) {
    // Must match speaker
    if (response.speaker_name.toLowerCase() !== excerpt.speaker.toLowerCase()) {
      continue;
    }

    const similarity = textSimilarity(excerpt.text, response.speaker_text);

    if (similarity > bestSimilarity) {
      bestSimilarity = similarity;
      bestMatch = response;
    }
  }

  // Return match only if similarity is above threshold
  if (bestMatch && bestSimilarity > 0.3) {
    return { response: bestMatch, similarity: bestSimilarity };
  }

  return null;
}

// Generate embedding for text using OpenAI
async function generateEmbedding(text: string): Promise<number[]> {
  if (!OPENAI_API_KEY) {
    console.warn('No OpenAI API key, skipping embedding generation');
    return [];
  }

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text,
      dimensions: 1536,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

// Main migration function
async function migrate() {
  console.log('🚀 Starting Hearst Anthology Migration...\n');

  // 1. Load the transcript JSON
  const transcriptPath = 'data/transcript_analysis.json';
  console.log(`📖 Reading transcript from: ${transcriptPath}`);

  const transcriptData: TranscriptAnalysis = JSON.parse(
    fs.readFileSync(transcriptPath, 'utf-8')
  );

  console.log(`   Found ${transcriptData.excerpts.length} excerpts`);
  console.log(`   Found ${transcriptData.themes.length} themes`);
  console.log(`   Found ${transcriptData.narratives.length} narratives\n`);

  // 2. Use the known Hearst Anthology ID
  const anthologyId = '8de959df-97d5-42ad-90f1-0b3de38daabe';
  console.log('🔍 Using Hearst Anthology...');

  const { data: conversation, error: anthologyError } = await supabase
    .from('anthology_conversations')
    .select('*')
    .eq('anthology_id', anthologyId)
    .single();

  if (anthologyError || !conversation) {
    console.error('❌ Could not find Hearst Anthology conversation');
    process.exit(1);
  }

  console.log(`   Found: ${conversation.title} (${anthologyId})\n`);

  // 3. Get existing responses
  console.log('📥 Fetching existing responses...');
  const { data: existingResponses, error: responsesError } = await supabase
    .from('anthology_responses')
    .select('*')
    .eq('anthology_id', anthologyId);

  if (responsesError) {
    console.error('❌ Error fetching responses:', responsesError);
    process.exit(1);
  }

  console.log(`   Found ${existingResponses?.length || 0} existing responses\n`);

  // 4. Get the question mapping
  console.log('🗺️  Building question mapping...');
  const { data: questions, error: questionsError } = await supabase
    .from('anthology_questions')
    .select('*')
    .eq('anthology_id', anthologyId);

  if (questionsError) {
    console.error('❌ Error fetching questions:', questionsError);
    process.exit(1);
  }

  // Build Q1 -> actual question ID mapping
  const questionMap = new Map<string, string>();
  transcriptData.facilitator_questions.forEach((q, idx) => {
    if (questions && questions[idx]) {
      questionMap.set(q.id, questions[idx].id);
    }
  });

  console.log(`   Mapped ${questionMap.size} questions\n`);

  // 5. Process excerpts and create migration plan
  console.log('🔄 Creating migration plan...\n');

  const migrationPlan: Array<{
    action: 'update' | 'create' | 'split';
    excerpt: Excerpt;
    existingId?: string;
    similarity?: number;
  }> = [];

  const usedResponseIds = new Set<string>();

  for (const excerpt of transcriptData.excerpts) {
    const match = findBestMatch(excerpt, existingResponses || []);

    if (match && !usedResponseIds.has(match.response.id)) {
      // Check if this response needs to be split (multiple excerpts map to same response)
      const otherExcerptsForSameResponse = transcriptData.excerpts.filter(
        e => e !== excerpt &&
        findBestMatch(e, existingResponses || [])?.response.id === match.response.id
      );

      if (otherExcerptsForSameResponse.length > 0) {
        migrationPlan.push({
          action: 'split',
          excerpt,
          existingId: match.response.id,
          similarity: match.similarity,
        });
      } else {
        migrationPlan.push({
          action: 'update',
          excerpt,
          existingId: match.response.id,
          similarity: match.similarity,
        });
      }

      usedResponseIds.add(match.response.id);
    } else {
      migrationPlan.push({
        action: 'create',
        excerpt,
      });
    }
  }

  // Print plan summary
  const updates = migrationPlan.filter(p => p.action === 'update').length;
  const splits = migrationPlan.filter(p => p.action === 'split').length;
  const creates = migrationPlan.filter(p => p.action === 'create').length;

  console.log('Migration Plan:');
  console.log(`   ✏️  Update existing: ${updates}`);
  console.log(`   ✂️  Split existing: ${splits}`);
  console.log(`   ➕ Create new: ${creates}`);
  console.log('');

  // 6. Confirm with user
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const proceed = await new Promise<boolean>((resolve) => {
    rl.question('Proceed with migration? (yes/no): ', (answer: string) => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
    });
  });

  if (!proceed) {
    console.log('❌ Migration cancelled');
    process.exit(0);
  }

  // 7. Execute migration
  console.log('\n🔨 Executing migration...\n');

  let successCount = 0;
  let errorCount = 0;

  for (const plan of migrationPlan) {
    const { excerpt, action, existingId } = plan;
    const questionId = questionMap.get(excerpt.question_id);

    if (!questionId) {
      console.warn(`⚠️  Skipping ${excerpt.id}: No question mapping found`);
      continue;
    }

    const metadata = {
      theme_ids: excerpt.theme_ids,
      narrative_ids: excerpt.narrative_ids,
      page: excerpt.page,
      themes: excerpt.theme_ids.map(tid => {
        const theme = transcriptData.themes.find(t => t.id === tid);
        return theme ? { id: theme.id, name: theme.name } : null;
      }).filter(Boolean),
      narratives: excerpt.narrative_ids.map(nid => {
        const narrative = transcriptData.narratives.find(n => n.id === nid);
        return narrative ? { id: narrative.id, name: narrative.name } : null;
      }).filter(Boolean),
    };

    try {
      if (action === 'update' && existingId) {
        // Update existing response
        const { error } = await supabase
          .from('anthology_responses')
          .update({
            speaker_text: excerpt.text,
            responds_to_question_id: questionId,
            metadata,
          })
          .eq('id', existingId);

        if (error) throw error;
        console.log(`✅ Updated ${excerpt.id} (${excerpt.speaker})`);
        successCount++;

      } else if (action === 'create' || action === 'split') {
        // Create new response (or split from existing)
        const existingResponse = existingId
          ? existingResponses?.find(r => r.id === existingId)
          : null;

        // Generate embedding
        let embedding = existingResponse?.embedding || null;
        if (!embedding || action === 'split') {
          try {
            const embeddingArray = await generateEmbedding(excerpt.text);
            embedding = embeddingArray;
            console.log(`   🔢 Generated embedding for ${excerpt.id}`);
          } catch (e) {
            console.warn(`   ⚠️  Could not generate embedding: ${e}`);
          }
        }

        const { error } = await supabase
          .from('anthology_responses')
          .insert({
            anthology_id: anthologyId,
            conversation_id: existingResponse?.conversation_id || conversation.id,
            legacy_id: excerpt.id,
            speaker_name: excerpt.speaker,
            speaker_text: excerpt.text,
            responds_to_question_id: questionId,
            embedding,
            metadata,
            audio_start_ms: existingResponse?.audio_start_ms || null,
            audio_end_ms: existingResponse?.audio_end_ms || null,
          });

        if (error) throw error;
        console.log(`✅ Created ${excerpt.id} (${excerpt.speaker})`);
        successCount++;
      }

    } catch (error) {
      console.error(`❌ Error processing ${excerpt.id}:`, error);
      errorCount++;
    }

    // Rate limit for OpenAI API
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log('\n✨ Migration complete!');
  console.log(`   ✅ Success: ${successCount}`);
  console.log(`   ❌ Errors: ${errorCount}`);
}

// Run migration
migrate().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

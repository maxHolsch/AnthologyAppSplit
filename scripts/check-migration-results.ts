import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

async function checkResults() {
  const anthologyId = '8de959df-97d5-42ad-90f1-0b3de38daabe';

  console.log('\n📊 Migration Results Summary\n');

  // Get all responses
  const { data: responses, error } = await supabase
    .from('anthology_responses')
    .select('*')
    .eq('anthology_id', anthologyId)
    .order('legacy_id');

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`Total responses: ${responses?.length || 0}\n`);

  // Check how many have themes/narratives
  const withThemes = responses?.filter(r => r.metadata?.theme_ids?.length > 0) || [];
  const withNarratives = responses?.filter(r => r.metadata?.narrative_ids?.length > 0) || [];

  console.log(`Responses with themes: ${withThemes.length}`);
  console.log(`Responses with narratives: ${withNarratives.length}\n`);

  // Show sample with themes
  console.log('Sample responses with theme/narrative metadata:\n');

  const samples = responses?.filter(r => r.metadata?.theme_ids?.length > 0).slice(0, 3) || [];

  samples.forEach((r, i) => {
    console.log(`${i + 1}. ${r.legacy_id || r.id.substring(0, 8)} - ${r.speaker_name}`);
    console.log(`   Text: ${r.speaker_text.substring(0, 80)}...`);
    console.log(`   Themes: ${r.metadata.themes?.map((t: any) => t.name).join(', ') || 'none'}`);
    console.log(`   Narratives: ${r.metadata.narratives?.map((n: any) => n.name).join(', ') || 'none'}`);
    console.log('');
  });

  // Theme frequency
  console.log('Theme frequency across all responses:\n');
  const themeCount = new Map<string, { name: string; count: number }>();

  responses?.forEach(r => {
    r.metadata?.themes?.forEach((theme: any) => {
      const current = themeCount.get(theme.id) || { name: theme.name, count: 0 };
      current.count++;
      themeCount.set(theme.id, current);
    });
  });

  const sortedThemes = Array.from(themeCount.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10);

  sortedThemes.forEach(([id, { name, count }]) => {
    console.log(`  ${id}: ${name.substring(0, 40).padEnd(42)} (${count} responses)`);
  });

  console.log('\nNarrative frequency across all responses:\n');
  const narrativeCount = new Map<string, { name: string; count: number }>();

  responses?.forEach(r => {
    r.metadata?.narratives?.forEach((narrative: any) => {
      const current = narrativeCount.get(narrative.id) || { name: narrative.name, count: 0 };
      current.count++;
      narrativeCount.set(narrative.id, current);
    });
  });

  const sortedNarratives = Array.from(narrativeCount.entries())
    .sort((a, b) => b[1].count - a[1].count);

  sortedNarratives.forEach(([id, { name, count }]) => {
    console.log(`  ${id}: ${name.substring(0, 50).padEnd(52)} (${count} responses)`);
  });

  // Check for responses without embeddings
  const withoutEmbeddings = responses?.filter(r => !r.embedding || r.embedding.length === 0) || [];
  console.log(`\nResponses without embeddings: ${withoutEmbeddings.length}`);

  // Legacy IDs
  const withLegacyId = responses?.filter(r => r.legacy_id?.startsWith('E')) || [];
  console.log(`Responses with legacy_id (from migration): ${withLegacyId.length}\n`);
}

checkResults();

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

async function findHearst() {
  // Find conversations with "hearst" in the title
  const { data: conversations, error } = await supabase
    .from('anthology_conversations')
    .select('anthology_id, title, id')
    .ilike('title', '%hearst%');

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('\nFound conversations with "hearst":');
  conversations?.forEach(c => {
    console.log(`  - "${c.title}" (anthology_id: ${c.anthology_id})`);
  });

  // Get unique anthology IDs
  const anthologyIds = [...new Set(conversations?.map(c => c.anthology_id))];

  if (anthologyIds.length > 0) {
    console.log(`\nUnique anthology_id(s): ${anthologyIds.join(', ')}`);

    // Check how many responses exist for this anthology
    for (const anthologyId of anthologyIds) {
      const { count } = await supabase
        .from('anthology_responses')
        .select('*', { count: 'exact', head: true })
        .eq('anthology_id', anthologyId);

      console.log(`  Anthology ${anthologyId}: ${count} responses`);
    }
  }
}

findHearst();

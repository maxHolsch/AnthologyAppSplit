import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

async function listAll() {
  const { data: conversations, error } = await supabase
    .from('anthology_conversations')
    .select('anthology_id, title, id, created_at')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('\nAll conversations:');
  conversations?.forEach((c, i) => {
    console.log(`  ${i + 1}. "${c.title}" (anthology_id: ${c.anthology_id}, created: ${c.created_at})`);
  });

  // Get unique anthology IDs and count responses
  const anthologyIds = [...new Set(conversations?.map(c => c.anthology_id))];

  console.log(`\n\nFound ${anthologyIds.length} unique anthology_id(s):\n`);

  for (const anthologyId of anthologyIds) {
    const { count: respCount } = await supabase
      .from('anthology_responses')
      .select('*', { count: 'exact', head: true })
      .eq('anthology_id', anthologyId);

    const { count: convCount } = await supabase
      .from('anthology_conversations')
      .select('*', { count: 'exact', head: true })
      .eq('anthology_id', anthologyId);

    console.log(`  ${anthologyId}:`);
    console.log(`    - ${convCount} conversations`);
    console.log(`    - ${respCount} responses`);
  }
}

listAll();

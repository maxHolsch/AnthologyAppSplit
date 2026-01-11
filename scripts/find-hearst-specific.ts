import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

async function findHearst() {
  const { data: conversations, error } = await supabase
    .from('anthology_conversations')
    .select('anthology_id, title, id, created_at')
    .or('title.ilike.%hearst%,title.ilike.%1768073557372%');

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('\nFound conversations matching "hearst" or "1768073557372":');
  conversations?.forEach(c => {
    console.log(`  - "${c.title}"`);
    console.log(`    anthology_id: ${c.anthology_id}`);
    console.log(`    conversation_id: ${c.id}`);
    console.log(`    created: ${c.created_at}\n`);
  });

  if (conversations && conversations.length > 0) {
    const anthologyId = conversations[0].anthology_id;

    const { count: respCount } = await supabase
      .from('anthology_responses')
      .select('*', { count: 'exact', head: true })
      .eq('anthology_id', anthologyId);

    const { count: qCount } = await supabase
      .from('anthology_questions')
      .select('*', { count: 'exact', head: true })
      .eq('anthology_id', anthologyId);

    console.log(`Stats for anthology ${anthologyId}:`);
    console.log(`  - ${respCount} responses`);
    console.log(`  - ${qCount} questions`);
  }
}

findHearst();

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

async function checkAnthologies() {
  const { data, error } = await supabase
    .from('anthologies')
    .select('id, title, slug, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('\nAvailable anthologies:');
  data?.forEach((a, i) => {
    console.log(`  ${i + 1}. "${a.title}" (slug: ${a.slug}, id: ${a.id})`);
  });
  console.log('');
}

checkAnthologies();

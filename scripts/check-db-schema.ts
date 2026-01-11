import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

async function checkSchema() {
  console.log('\nChecking database schema...\n');

  // Try different table names
  const tables = [
    'anthologies',
    'anthology',
    'anthology_responses',
    'anthology_questions',
    'anthology_conversations',
    'responses',
    'questions',
    'conversations'
  ];

  for (const table of tables) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .limit(1);

    if (!error) {
      console.log(`✅ Found table: ${table}`);
      if (data && data.length > 0) {
        console.log(`   Sample columns: ${Object.keys(data[0]).join(', ')}`);
      }
    }
  }
}

checkSchema();

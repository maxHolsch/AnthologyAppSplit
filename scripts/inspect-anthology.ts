import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

async function inspect() {
  const anthologyId = '8de959df-97d5-42ad-90f1-0b3de38daabe';

  console.log(`\nInspecting anthology: ${anthologyId}\n`);

  // Get conversation
  const { data: conversation } = await supabase
    .from('anthology_conversations')
    .select('*')
    .eq('anthology_id', anthologyId)
    .single();

  console.log('Conversation:');
  console.log(`  Title: ${conversation?.title}`);
  console.log(`  Participants: ${conversation?.participants?.join(', ') || 'N/A'}`);
  console.log('');

  // Get questions
  const { data: questions } = await supabase
    .from('anthology_questions')
    .select('question_text')
    .eq('anthology_id', anthologyId)
    .limit(3);

  console.log('Sample questions:');
  questions?.forEach((q, i) => {
    console.log(`  ${i + 1}. ${q.question_text.substring(0, 80)}...`);
  });
  console.log('');

  // Get sample responses
  const { data: responses } = await supabase
    .from('anthology_responses')
    .select('speaker_name, speaker_text')
    .eq('anthology_id', anthologyId)
    .limit(3);

  console.log('Sample responses:');
  responses?.forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.speaker_name}: ${r.speaker_text.substring(0, 100)}...`);
  });
}

inspect();

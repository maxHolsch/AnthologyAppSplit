/**
 * Speaker Service
 * Handles speaker management and color assignment
 */

import { supabase, type DbSpeaker } from './supabaseClient';
import { DEFAULT_PALETTE, buildSpeakerColorScheme } from '@/utils/colorAssignment';
import { supabaseQuery } from './supabaseQuery';

// ============================================
// HELPER FUNCTIONS
// ============================================

async function getAnthologyIdForConversation(conversationDbId: string): Promise<string> {
  const data = await supabaseQuery(
    () => supabase
      .from('anthology_conversations')
      .select('anthology_id')
      .eq('id', conversationDbId)
      .single(),
    {
      operation: 'get anthology ID for conversation',
      context: { conversationDbId }
    }
  );

  if (!data?.anthology_id) {
    throw new Error('Conversation has no anthology_id (schema migration may be incomplete)');
  }

  return data.anthology_id as string;
}

const pickSpeakerBaseColor = (index: number) => DEFAULT_PALETTE[index % DEFAULT_PALETTE.length];

// ============================================
// SPEAKER SERVICE
// ============================================

export const SpeakerService = {
  /**
   * Ensure a speaker exists in anthology_speakers for this conversation.
   * Returns the speaker row.
   */
  async ensureSpeaker(
    conversationDbId: string,
    speakerName: string,
    opts?: { anthologyId?: string }
  ): Promise<DbSpeaker> {
    const anthologyId = opts?.anthologyId || (await getAnthologyIdForConversation(conversationDbId));

    // 1) Try to find existing
    const { data: existing, error: existingErr } = await supabase
      .from('anthology_speakers')
      .select('*')
      .eq('anthology_id', anthologyId)
      .eq('conversation_id', conversationDbId)
      .eq('name', speakerName)
      .maybeSingle();

    if (existingErr) {
      throw existingErr;
    }

    if (existing) {
      return existing as DbSpeaker;
    }

    // 2) Count existing speakers to choose a color
    const { data: allSpeakers, error: listErr } = await supabase
      .from('anthology_speakers')
      .select('id')
      .eq('anthology_id', anthologyId)
      .eq('conversation_id', conversationDbId);

    if (listErr) {
      throw listErr;
    }

    const index = (allSpeakers?.length ?? 0);
    const base = pickSpeakerBaseColor(index);
    const colors = buildSpeakerColorScheme(base);

    const { data: created, error: createErr } = await supabase
      .from('anthology_speakers')
      .insert({
        anthology_id: anthologyId,
        conversation_id: conversationDbId,
        name: speakerName,
        ...colors,
      })
      .select('*')
      .single();

    if (createErr) {
      throw createErr;
    }

    return created as DbSpeaker;
  },
};

// Export helper for use by other services
export { getAnthologyIdForConversation };

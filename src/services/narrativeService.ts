/**
 * Narrative Service
 * Handles narrative operations
 */

import type { NarrativeNode } from '@/types/data.types';
import { supabase } from './supabaseClient';

export const NarrativeService = {
  /**
   * Get all narratives for a conversation
   */
  async getByConversation(conversationId: string): Promise<NarrativeNode[]> {
    const { data, error } = await supabase
      .from('anthology_narratives')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at');

    if (error) {
      console.error('Error fetching narratives:', error);
      return [];
    }

    return data.map((n: any) => ({
      type: 'narrative' as const,
      id: n.legacy_id || n.id,
      _db_id: n.id,
      narrative_text: n.narrative_text,
      related_responses: [], // Will be populated if needed
      path_to_recording: undefined, // Narratives don't have recordings
      notes: n.notes
    }));
  }
};

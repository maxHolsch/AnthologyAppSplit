/**
 * Narrative Service
 * Handles narrative operations via REST API
 */

import type { NarrativeNode } from '@/types/data.types';
import { apiClient } from './apiClient';
import type { ApiNarrative } from '../../shared/types/api.types';

/**
 * Transform API narrative to legacy NarrativeNode type
 */
function toNarrative(api: ApiNarrative): NarrativeNode & { _db_id: string } {
  return {
    type: 'narrative' as const,
    id: api.legacyId || api.id,
    _db_id: api.id,
    narrative_text: api.narrativeText,
    related_responses: api.relatedResponses,
    path_to_recording: undefined, // Narratives don't have recordings
    notes: api.notes,
  };
}

export const NarrativeService = {
  /**
   * Get all narratives for a conversation
   */
  async getByConversation(conversationId: string): Promise<NarrativeNode[]> {
    try {
      const narratives = await apiClient.get<ApiNarrative[]>(
        `/conversations/${conversationId}/narratives`
      );
      return narratives.map(toNarrative);
    } catch (error) {
      console.error('Error fetching narratives:', error);
      return [];
    }
  },
};

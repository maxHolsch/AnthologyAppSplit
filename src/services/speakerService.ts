/**
 * Speaker Service
 * Handles speaker management and color assignment via REST API
 */

import { apiClient } from './apiClient';
import type { ApiSpeaker, CreateSpeakerRequest } from '../../shared/types/api.types';
import type { DbSpeaker } from './supabaseClient';
export type { DbSpeaker };

/**
 * Transform API speaker to DbSpeaker format
 */
function toDbSpeaker(api: ApiSpeaker): DbSpeaker {
  return {
    id: api.id,
    name: api.name,
    conversation_id: api.conversationId,
    circle_color: api.circleColor,
    faded_circle_color: api.fadedCircleColor,
    quote_rectangle_color: api.quoteRectangleColor,
    faded_quote_rectangle_color: api.fadedQuoteRectangleColor,
    quote_text_color: api.quoteTextColor,
    faded_quote_text_color: api.fadedQuoteTextColor,
    created_at: api.createdAt,
    updated_at: api.createdAt, // API doesn't return updated_at, use created_at
  };
}

export const SpeakerService = {
  /**
   * Ensure a speaker exists in anthology_speakers for this conversation.
   * Returns the speaker row.
   */
  async ensureSpeaker(
    conversationDbId: string,
    speakerName: string,
    _opts?: { anthologyId?: string }
  ): Promise<DbSpeaker> {
    // First try to get existing speaker
    try {
      const speakers = await apiClient.get<ApiSpeaker[]>(
        `/conversations/${conversationDbId}/speakers`
      );

      const existing = speakers.find((s) => s.name === speakerName);
      if (existing) {
        return toDbSpeaker(existing);
      }
    } catch (error) {
      // If error fetching speakers, continue to create
      console.warn('Error fetching speakers, attempting to create:', error);
    }

    // Create new speaker
    const request: CreateSpeakerRequest = {
      conversationId: conversationDbId,
      name: speakerName,
    };

    const created = await apiClient.post<ApiSpeaker>('/speakers', request);
    return toDbSpeaker(created);
  },
};

/**
 * Get anthology ID for a conversation
 * This is a helper function used by other services
 */
export async function getAnthologyIdForConversation(conversationDbId: string): Promise<string> {
  // Get conversation to find anthology_id
  const response = await fetch(`/api/conversations/${conversationDbId}`);
  if (!response.ok) {
    throw new Error('Failed to fetch conversation');
  }
  const { data } = await response.json();
  if (!data.anthologyId) {
    throw new Error('Conversation has no anthology_id');
  }
  return data.anthologyId;
}

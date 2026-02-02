/**
 * Conversation Service
 * Handles conversation data and speaker lookups via REST API
 */

import type { Conversation, SpeakerColorScheme } from '@/types/data.types';
import { apiClient, ApiError } from './apiClient';
import type { ApiConversation, ApiSpeaker } from '../../shared/types/api.types';

/**
 * Transform API conversation to legacy Conversation type
 */
function toConversation(api: ApiConversation): Conversation & { _db_id: string } {
  return {
    conversation_id: api.legacyId || api.id,
    audio_file: api.audioFile,
    duration: api.duration,
    color: api.color,
    metadata: {
      title: api.metadata.title,
      date: api.metadata.date,
      participants: api.metadata.participants,
      speaker_colors: api.metadata.speakerColors,
      location: api.metadata.location,
      facilitator: api.metadata.facilitator,
      topics: api.metadata.topics,
      source_transcript: api.metadata.sourceTranscript,
    },
    _db_id: api.id,
  };
}

/**
 * Transform API speaker to SpeakerColorScheme
 */
function toSpeakerColorScheme(api: ApiSpeaker): SpeakerColorScheme {
  return {
    circle: api.circleColor,
    fadedCircle: api.fadedCircleColor,
    quoteRectangle: api.quoteRectangleColor,
    fadedQuoteRectangle: api.fadedQuoteRectangleColor,
    quoteText: api.quoteTextColor,
    fadedQuoteText: api.fadedQuoteTextColor,
  };
}

export const ConversationService = {
  /**
   * Get all conversations with their recordings
   */
  async getAll(opts?: { anthologyId?: string }): Promise<Conversation[]> {
    try {
      const response = await apiClient.getList<ApiConversation>('/conversations', {
        anthologyId: opts?.anthologyId,
        limit: 1000, // Load all conversations
      });

      return response.data.map(toConversation);
    } catch (error) {
      console.error('Error fetching conversations:', error);
      return [];
    }
  },

  /**
   * Get conversation by ID
   */
  async getById(id: string): Promise<Conversation | null> {
    try {
      const conversation = await apiClient.get<ApiConversation>(`/conversations/${id}`);
      return toConversation(conversation);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'NOT_FOUND') {
        return null;
      }
      console.error('Error fetching conversation:', error);
      return null;
    }
  },

  /**
   * Get speakers for a conversation
   */
  async getSpeakers(conversationId: string): Promise<Map<string, SpeakerColorScheme>> {
    try {
      const speakers = await apiClient.get<ApiSpeaker[]>(
        `/conversations/${conversationId}/speakers`
      );

      const speakerMap = new Map<string, SpeakerColorScheme>();
      speakers.forEach((speaker) => {
        speakerMap.set(speaker.name, toSpeakerColorScheme(speaker));
      });

      return speakerMap;
    } catch (error) {
      console.error('Error fetching speakers:', error);
      return new Map();
    }
  },
};

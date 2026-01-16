/**
 * Conversation Service
 * Handles conversation data and speaker lookups
 */

import type { Conversation } from '@/types/data.types';
import { supabase, type DbSpeaker } from './supabaseClient';

export const ConversationService = {
  /**
   * Get all conversations with their recordings
   */
  async getAll(opts?: { anthologyId?: string }): Promise<Conversation[]> {
    let q = supabase
      .from('anthology_conversations')
      .select(`
        *,
        anthology_conversation_recordings!inner (
          is_primary,
          recording_id,
          anthology_recordings (*)
        )
      `)
      .order('created_at', { ascending: false });

    if (opts?.anthologyId) {
      q = q.eq('anthology_id', opts.anthologyId);
    }

    const { data: conversations, error: convError } = await q;

    if (convError) {
      console.error('Error fetching conversations:', convError);
      return [];
    }

    // Transform to Conversation type
    return conversations.map((conv: any) => {
      const primaryRecordingLink = conv.anthology_conversation_recordings.find(
        (cr: any) => cr.is_primary
      );
      const primaryRecording = primaryRecordingLink?.anthology_recordings;

      return {
        conversation_id: conv.legacy_id || conv.id, // Use legacy_id for compatibility
        audio_file: primaryRecording?.file_path || '',
        duration: primaryRecording?.duration_ms || 0,
        color: conv.color,
        metadata: {
          title: conv.title,
          date: conv.date || '',
          participants: conv.participants || [],
          location: conv.location,
          facilitator: conv.facilitator,
          topics: conv.topics || [],
          source_transcript: conv.source_transcript,
          speaker_colors: conv.metadata?.speaker_colors,
          ...conv.metadata
        },
        _db_id: conv.id // Store the actual UUID for database queries
      };
    });
  },

  /**
   * Get conversation by ID
   */
  async getById(id: string): Promise<Conversation | null> {
    const { data, error } = await supabase
      .from('anthology_conversations')
      .select(`
        *,
        anthology_conversation_recordings (
          recording:anthology_recordings (*)
        )
      `)
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching conversation:', error);
      return null;
    }

    const primaryRecording = data.anthology_conversation_recordings.find(
      (cr: any) => cr.is_primary
    )?.recording;

    return {
      conversation_id: data.id,
      audio_file: primaryRecording?.file_path || '',
      duration: primaryRecording?.duration_ms || 0,
      color: data.color,
      metadata: {
        title: data.title,
        date: data.date || '',
        participants: data.participants || [],
        location: data.location,
        facilitator: data.facilitator,
        topics: data.topics || [],
        source_transcript: data.source_transcript,
        ...data.metadata
      }
    };
  },

  /**
   * Get speakers for a conversation
   */
  async getSpeakers(conversationId: string): Promise<Map<string, any>> {
    const { data, error } = await supabase
      .from('anthology_speakers')
      .select('*')
      .eq('conversation_id', conversationId);

    if (error) {
      console.error('Error fetching speakers:', error);
      return new Map();
    }

    const speakerMap = new Map();
    data.forEach((speaker: DbSpeaker) => {
      speakerMap.set(speaker.name, {
        circle: speaker.circle_color,
        fadedCircle: speaker.faded_circle_color,
        quoteRectangle: speaker.quote_rectangle_color,
        fadedQuoteRectangle: speaker.faded_quote_rectangle_color,
        quoteText: speaker.quote_text_color,
        fadedQuoteText: speaker.faded_quote_text_color
      });
    });

    return speakerMap;
  }
};

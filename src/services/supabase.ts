/**
 * Supabase Service Layer
 *
 * Provides typed methods to interact with Anthology database
 */

import { createClient } from '@supabase/supabase-js';
import type {
  Conversation,
  QuestionNode,
  ResponseNode,
  WordTimestamp
} from '@/types/data.types';

// ============================================
// SUPABASE CLIENT
// ============================================

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('⚠️  Supabase credentials not found. Using fallback JSON mode.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ============================================
// STORAGE
// ============================================

// NOTE: Supabase bucket names are case-sensitive. Default bucket used by this
// project is "Recordings".
const RECORDINGS_BUCKET = import.meta.env.VITE_SUPABASE_RECORDINGS_BUCKET || 'Recordings';

// ============================================
// DATABASE TYPES
// ============================================

interface DbRecording {
  id: string;
  file_path: string;
  file_name: string;
  duration_ms: number;
  file_size_bytes?: number;
  mime_type?: string;
  created_at: string;
  updated_at: string;
}

interface DbSpeaker {
  id: string;
  name: string;
  conversation_id: string;
  circle_color: string;
  faded_circle_color: string;
  quote_rectangle_color: string;
  faded_quote_rectangle_color: string;
  quote_text_color: string;
  faded_quote_text_color: string;
  created_at: string;
  updated_at: string;
}


interface DbWordTimestamp {
  id: string;
  response_id?: string;
  question_id?: string;
  text: string;
  start_ms: number;
  end_ms: number;
  confidence?: number;
  speaker?: string;
  word_order: number;
  created_at: string;
}

// ============================================
// RECORDING SERVICE
// ============================================

export const RecordingService = {
  /**
   * Get recording by ID
   */
  async getById(id: string): Promise<DbRecording | null> {
    const { data, error } = await supabase
      .from('recordings')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching recording:', error);
      return null;
    }

    return data;
  },

  /**
   * Get all recordings
   */
  async getAll(): Promise<DbRecording[]> {
    const { data, error } = await supabase
      .from('recordings')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching recordings:', error);
      return [];
    }

    return data || [];
  },

  /**
   * Upload new recording
   */
  async upload(file: File): Promise<DbRecording | null> {
    // Upload to Supabase Storage
    const fileName = `${Date.now()}_${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from(RECORDINGS_BUCKET)
      .upload(fileName, file, {
        contentType: file.type || undefined,
      });

    if (uploadError) {
      if (typeof uploadError.message === 'string' && uploadError.message.includes('row-level security')) {
        console.error(
          `Supabase Storage RLS blocked upload. Ensure you have an INSERT policy on storage.objects for bucket "${RECORDINGS_BUCKET}".`
        );
      }
      console.error('Error uploading recording:', uploadError);
      return null;
    }

    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from(RECORDINGS_BUCKET)
      .getPublicUrl(fileName);

    // Create database entry
    const { data, error } = await supabase
      .from('recordings')
      .insert({
        file_path: publicUrlData.publicUrl,
        file_name: fileName,
        file_size_bytes: file.size,
        mime_type: file.type,
        duration_ms: 0 // You'll need to extract this from the audio file
      })
      .select()
      .single();

    if (error) {
      // With RLS enabled, anon key inserts will fail unless you add an INSERT policy.
      if ((error as any)?.code === '42501' || (error as any)?.message?.includes('row-level security')) {
        console.error(
          'Database RLS blocked insert into recordings. Add an INSERT policy for the anon/public role if you want browser uploads to create DB rows.'
        );
      }
      console.error('Error creating recording entry:', error);
      return null;
    }

    return data;
  }
};

// ============================================
// CONVERSATION SERVICE
// ============================================

export const ConversationService = {
  /**
   * Get all conversations with their recordings
   */
  async getAll(): Promise<Conversation[]> {
    const { data: conversations, error: convError } = await supabase
      .from('conversations')
      .select(`
        *,
        conversation_recordings!inner (
          recording:recordings (*)
        )
      `)
      .order('created_at', { ascending: false });

    if (convError) {
      console.error('Error fetching conversations:', convError);
      return [];
    }

    // Transform to Conversation type
    return conversations.map((conv: any) => {
      const primaryRecording = conv.conversation_recordings.find(
        (cr: any) => cr.is_primary
      )?.recording;

      return {
        conversation_id: conv.id,
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
          ...conv.metadata
        }
      };
    });
  },

  /**
   * Get conversation by ID
   */
  async getById(id: string): Promise<Conversation | null> {
    const { data, error } = await supabase
      .from('conversations')
      .select(`
        *,
        conversation_recordings (
          recording:recordings (*)
        )
      `)
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching conversation:', error);
      return null;
    }

    const primaryRecording = data.conversation_recordings.find(
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
      .from('speakers')
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

// ============================================
// QUESTION SERVICE
// ============================================

export const QuestionService = {
  /**
   * Get all questions for a conversation
   */
  async getByConversation(conversationId: string): Promise<QuestionNode[]> {
    const { data, error } = await supabase
      .from('questions')
      .select(`
        *,
        recording:recordings (*)
      `)
      .eq('conversation_id', conversationId)
      .order('created_at');

    if (error) {
      console.error('Error fetching questions:', error);
      return [];
    }

    return data.map((q: any) => ({
      type: 'question' as const,
      id: q.legacy_id || q.id,
      question_text: q.question_text,
      related_responses: [], // Will be populated when loading responses
      path_to_recording: q.recording?.file_path,
      audio_start_ms: q.audio_start_ms,
      audio_end_ms: q.audio_end_ms,
      facilitator: q.facilitator,
      notes: q.notes
    }));
  },

  /**
   * Get responses for a question
   */
  async getResponses(questionId: string): Promise<ResponseNode[]> {
    const { data, error } = await supabase
      .from('responses')
      .select(`
        *,
        recording:recordings (*),
        speaker:speakers (*)
      `)
      .eq('responds_to_question_id', questionId)
      .order('turn_number');

    if (error) {
      console.error('Error fetching question responses:', error);
      return [];
    }

    return data.map((r: any) => ({
      type: 'response' as const,
      id: r.legacy_id || r.id,
      responds_to: questionId,
      speaker_name: r.speaker_name,
      speaker_text: r.speaker_text,
      pull_quote: r.pull_quote,
      audio_start: r.audio_start_ms,
      audio_end: r.audio_end_ms,
      conversation_id: r.conversation_id,
      path_to_recording: r.recording?.file_path,
      turn_number: r.turn_number
    }));
  }
};

// ============================================
// RESPONSE SERVICE
// ============================================

export const ResponseService = {
  /**
   * Get all responses for a conversation
   */
  async getByConversation(conversationId: string): Promise<ResponseNode[]> {
    const { data, error } = await supabase
      .from('responses')
      .select(`
        *,
        recording:recordings (*),
        speaker:speakers (*)
      `)
      .eq('conversation_id', conversationId)
      .order('turn_number');

    if (error) {
      console.error('Error fetching responses:', error);
      return [];
    }

    return data.map((r: any) => {
      const respondsTo = r.responds_to_question_id
        ? `q_${r.responds_to_question_id}`
        : r.responds_to_response_id
        ? `r_${r.responds_to_response_id}`
        : '';

      return {
        type: 'response' as const,
        id: r.legacy_id || r.id,
        responds_to: respondsTo,
        speaker_name: r.speaker_name,
        speaker_text: r.speaker_text,
        pull_quote: r.pull_quote,
        audio_start: r.audio_start_ms,
        audio_end: r.audio_end_ms,
        conversation_id: r.conversation_id,
        path_to_recording: r.recording?.file_path,
        turn_number: r.turn_number
      };
    });
  },

  /**
   * Get word timestamps for a response
   */
  async getWordTimestamps(responseId: string): Promise<WordTimestamp[]> {
    const { data, error } = await supabase
      .from('word_timestamps')
      .select('*')
      .eq('response_id', responseId)
      .order('word_order');

    if (error) {
      console.error('Error fetching word timestamps:', error);
      return [];
    }

    return data.map((w: DbWordTimestamp) => ({
      text: w.text,
      start: w.start_ms,
      end: w.end_ms,
      confidence: w.confidence || 0,
      speaker: w.speaker || ''
    }));
  }
};

// ============================================
// GRAPH DATA SERVICE
// ============================================

export const GraphDataService = {
  /**
   * Load complete graph data for visualization
   * This is the main entry point for loading data into AnthologyStore
   */
  async loadAll() {
    try {
      // Load conversations
      const conversations = await ConversationService.getAll();

      if (conversations.length === 0) {
        console.warn('No conversations found in database');
        return { conversations: [], questions: [], responses: [] };
      }

      // Load questions and responses for all conversations
      const allQuestions: QuestionNode[] = [];
      const allResponses: ResponseNode[] = [];

      for (const conv of conversations) {
        const questions = await QuestionService.getByConversation(conv.conversation_id);
        const responses = await ResponseService.getByConversation(conv.conversation_id);

        // Get speaker colors for this conversation
        const speakers = await ConversationService.getSpeakers(conv.conversation_id);

        // Add speaker colors to conversation metadata
        if (speakers.size > 0) {
          conv.metadata.speaker_colors = Object.fromEntries(speakers);
        }

        allQuestions.push(...questions);
        allResponses.push(...responses);
      }

      // Link questions to responses
      allQuestions.forEach((q) => {
        q.related_responses = allResponses
          .filter((r) => r.responds_to === q.id)
          .map((r) => r.id);
      });

      return {
        conversations,
        questions: allQuestions,
        responses: allResponses
      };
    } catch (error) {
      console.error('Error loading graph data:', error);
      throw error;
    }
  },

  /**
   * Subscribe to real-time updates
   */
  subscribeToUpdates(callback: () => void) {
    const channels = [
      supabase
        .channel('conversations-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, callback)
        .subscribe(),

      supabase
        .channel('questions-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'questions' }, callback)
        .subscribe(),

      supabase
        .channel('responses-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'responses' }, callback)
        .subscribe()
    ];

    return () => {
      channels.forEach((channel) => supabase.removeChannel(channel));
    };
  }
};

// ============================================
// ADMIN SERVICE (for adding new data)
// ============================================

export const AdminService = {
  /**
   * Add a new response with its own recording
   */
  async addResponse({
    conversationId,
    questionId,
    speakerName,
    speakerText,
    pullQuote,
    recordingFile,
    audioStartMs = 0,
    audioEndMs
  }: {
    conversationId: string;
    questionId: string;
    speakerName: string;
    speakerText: string;
    pullQuote?: string;
    recordingFile: File;
    audioStartMs?: number;
    audioEndMs: number;
  }) {
    // 1. Upload recording
    const recording = await RecordingService.upload(recordingFile);
    if (!recording) {
      throw new Error('Failed to upload recording');
    }

    // 2. Get or create speaker
    const { data: speaker } = await supabase
      .from('speakers')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('name', speakerName)
      .single();

    // 3. Create response
    const { data: response, error } = await supabase
      .from('responses')
      .insert({
        conversation_id: conversationId,
        responds_to_question_id: questionId,
        speaker_id: speaker?.id,
        speaker_name: speakerName,
        speaker_text: speakerText,
        pull_quote: pullQuote,
        recording_id: recording.id,
        audio_start_ms: audioStartMs,
        audio_end_ms: audioEndMs
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating response:', error);
      throw error;
    }

    return response;
  }
};

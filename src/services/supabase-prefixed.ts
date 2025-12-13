/**
 * Supabase Service Layer (Prefixed Tables)
 *
 * Provides typed methods to interact with Anthology database
 * All tables prefixed with "anthology_"
 */

import { createClient } from '@supabase/supabase-js';
import type {
  Conversation,
  QuestionNode,
  ResponseNode,
  WordTimestamp
} from '@/types/data.types';

import { DEFAULT_PALETTE, hexToRgba, darkenColor } from '@/utils/colorAssignment';

// ============================================
// SUPABASE CLIENT
// ============================================

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://enokfgiwbgianwblplcn.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_3Dc14gtlg0fz1LiK71w9_g_5iHMb7Of';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ============================================
// STORAGE
// ============================================

// NOTE: Supabase bucket names are case-sensitive. This project uses the bucket
// named "Recordings" (capital R) in the Supabase dashboard.
const RECORDINGS_BUCKET = import.meta.env.VITE_SUPABASE_RECORDINGS_BUCKET || 'Recordings';

// ============================================
// COLOR HELPERS (for new speakers)
// ============================================

const pickSpeakerBaseColor = (index: number) => DEFAULT_PALETTE[index % DEFAULT_PALETTE.length];

const buildSpeakerColors = (base: string) => {
  return {
    circle_color: base,
    faded_circle_color: hexToRgba(base, 0.35),
    quote_rectangle_color: hexToRgba(base, 0.15),
    faded_quote_rectangle_color: hexToRgba(base, 0.08),
    quote_text_color: darkenColor(base, 0.4),
    faded_quote_text_color: darkenColor(base, 0.4),
  };
};

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


interface DbResponse {
  id: string;
  legacy_id?: string;
  conversation_id: string;
  responds_to_question_id?: string;
  responds_to_response_id?: string;
  speaker_id?: string;
  speaker_name: string;
  speaker_text: string;
  pull_quote?: string;
  recording_id?: string;
  audio_start_ms?: number;
  audio_end_ms?: number;
  turn_number?: number;
  metadata?: any;
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
      .from('anthology_recordings')
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
      .from('anthology_recordings')
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
  async upload(file: File, durationMs?: number): Promise<DbRecording | null> {
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
      .from('anthology_recordings')
      .insert({
        file_path: publicUrlData.publicUrl,
        file_name: fileName,
        file_size_bytes: file.size,
        mime_type: file.type,
        duration_ms: durationMs ?? 0
      })
      .select()
      .single();

    if (error) {
      // With RLS enabled, anon key inserts will fail unless you add an INSERT policy.
      if ((error as any)?.code === '42501' || (error as any)?.message?.includes('row-level security')) {
        console.error(
          'Database RLS blocked insert into anthology_recordings. Add an INSERT policy for the anon/public role if you want browser uploads to create DB rows.'
        );
      }
      console.error('Error creating recording entry:', error);
      return null;
    }

    return data;
  }
};

// ============================================
// SPEAKER SERVICE
// ============================================

export const SpeakerService = {
  /**
   * Ensure a speaker exists in anthology_speakers for this conversation.
   * Returns the speaker row.
   */
  async ensureSpeaker(conversationDbId: string, speakerName: string): Promise<DbSpeaker> {
    // 1) Try to find existing
    const { data: existing, error: existingErr } = await supabase
      .from('anthology_speakers')
      .select('*')
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
      .eq('conversation_id', conversationDbId);

    if (listErr) {
      throw listErr;
    }

    const index = (allSpeakers?.length ?? 0);
    const base = pickSpeakerBaseColor(index);
    const colors = buildSpeakerColors(base);

    const { data: created, error: createErr } = await supabase
      .from('anthology_speakers')
      .insert({
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

// ============================================
// CONVERSATION SERVICE
// ============================================

export const ConversationService = {
  /**
   * Get all conversations with their recordings
   */
  async getAll(): Promise<Conversation[]> {
    const { data: conversations, error: convError } = await supabase
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

      console.log('🔊 Audio Debug (Service): Processing conversation', {
        conversation_id: conv.legacy_id || conv.id,
        title: conv.title,
        has_recordings: !!conv.anthology_conversation_recordings,
        recordings_count: conv.anthology_conversation_recordings?.length,
        primaryRecordingLink: primaryRecordingLink,
        primaryRecording: primaryRecording,
        file_path: primaryRecording?.file_path
      });

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

// ============================================
// QUESTION SERVICE
// ============================================

export const QuestionService = {
  /**
   * Get all questions for a conversation
   */
  async getByConversation(conversationId: string): Promise<QuestionNode[]> {
    const { data, error } = await supabase
      .from('anthology_questions')
      .select(`
        *,
        recording:anthology_recordings (*)
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
      _db_id: q.id,
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
      .from('anthology_responses')
      .select(`
        *,
        recording:anthology_recordings (*),
        speaker:anthology_speakers (*)
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
      .from('anthology_responses')
      .select(`
        *,
        recording:anthology_recordings (*),
        speaker:anthology_speakers (*),
        conversation:anthology_conversations!conversation_id (id, legacy_id)
      `)
      .eq('conversation_id', conversationId)
      .order('turn_number');

    if (error) {
      console.error('Error fetching responses:', error);
      return [];
    }

    return data.map((r: any) => {
      // IMPORTANT:
      // - We intentionally do NOT expand the parent question/response relationship here.
      //   PostgREST relationship names can vary across Supabase projects, and self-joins
      //   often fail with PGRST200 (schema cache mismatch).
      // - Instead, we return the raw FK UUID in `responds_to` and canonicalize it inside
      //   GraphDataService.loadAll() once we have all questions/responses loaded.
      const respondsToFk = (r.responds_to_question_id || r.responds_to_response_id || '') as string;

      return {
        type: 'response' as const,
        id: r.legacy_id || r.id,
        _db_id: r.id,
        responds_to: respondsToFk,
        speaker_name: r.speaker_name,
        speaker_text: r.speaker_text,
        pull_quote: r.pull_quote,
        audio_start: r.audio_start_ms,
        audio_end: r.audio_end_ms,
        conversation_id: r.conversation?.legacy_id || r.conversation?.id || r.conversation_id,
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
      .from('anthology_word_timestamps')
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
        // Use the database UUID for queries, not the legacy_id
        const dbId = (conv as any)._db_id || conv.conversation_id;

        const questions = await QuestionService.getByConversation(dbId);
        const responses = await ResponseService.getByConversation(dbId);

        // Get speaker colors for this conversation
        const speakers = await ConversationService.getSpeakers(dbId);

        // Add speaker colors to conversation metadata
        if (speakers.size > 0) {
          conv.metadata.speaker_colors = Object.fromEntries(speakers);
        }

        allQuestions.push(...questions);
        allResponses.push(...responses);
      }

      // Link questions to responses
      // Canonicalize `responds_to`.
      // ResponseService returns raw FK UUIDs in `responds_to` to avoid PostgREST
      // relationship expansion issues (especially self-joins). Once we have the full
      // dataset, convert those UUIDs into the canonical node IDs used throughout the app
      // (legacy_id when present, otherwise UUID).
      const questionDbIdToCanonicalId = new Map<string, string>();
      allQuestions.forEach((q: any) => {
        const dbId = q?._db_id;
        if (typeof dbId === 'string' && dbId.length > 0) {
          questionDbIdToCanonicalId.set(dbId, q.id);
        }
      });

      const responseDbIdToCanonicalId = new Map<string, string>();
      allResponses.forEach((r: any) => {
        const dbId = r?._db_id;
        if (typeof dbId === 'string' && dbId.length > 0) {
          responseDbIdToCanonicalId.set(dbId, r.id);
        }
      });

      const canonicalizeNodeId = (maybeDbId: string) => {
        return (
          questionDbIdToCanonicalId.get(maybeDbId) ||
          responseDbIdToCanonicalId.get(maybeDbId) ||
          maybeDbId
        );
      };

      const canonicalResponses = allResponses.map((r) => ({
        ...r,
        responds_to: canonicalizeNodeId(r.responds_to)
      }));

      allResponses.length = 0;
      allResponses.push(...canonicalResponses);

      // Link questions to responses (question-only)
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
        .on('postgres_changes', { event: '*', schema: 'public', table: 'anthology_conversations' }, callback)
        .subscribe(),

      supabase
        .channel('questions-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'anthology_questions' }, callback)
        .subscribe(),

      supabase
        .channel('responses-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'anthology_responses' }, callback)
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
      .from('anthology_speakers')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('name', speakerName)
      .single();

    // 3. Create response
    const { data: response, error } = await supabase
      .from('anthology_responses')
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
  ,

  /**
   * Add a new response that responds to another response (node-to-node reply).
   * This is used by the UI "Respond to {speaker}" flow.
   */
  async addResponseToResponse({
    conversationId,
    parentResponseId,
    respondentName,
    speakerText,
    recordingFile,
    recordingId,
    recordingDurationMs,
  }: {
    conversationId: string; // legacy id or db uuid
    parentResponseId: string; // legacy id or db uuid
    respondentName: string;
    speakerText: string;
    recordingFile?: File;
    recordingId?: string;
    recordingDurationMs?: number;
  }) {
    // Resolve conversation DB id (UUID)
    const conversationDbId = await (async () => {
      // If this is already a UUID, this query will likely fail; then we fallback to using it as-is.
      const { data, error } = await supabase
        .from('anthology_conversations')
        .select('id')
        .eq('legacy_id', conversationId)
        .maybeSingle();

      if (error) {
        throw error;
      }
      return data?.id || conversationId;
    })();

    // Resolve parent response DB id (UUID)
    const parentResponseDbId = await (async () => {
      const { data, error } = await supabase
        .from('anthology_responses')
        .select('id')
        .eq('legacy_id', parentResponseId)
        .maybeSingle();

      if (error) {
        throw error;
      }
      return data?.id || parentResponseId;
    })();

    // Ensure speaker exists
    const speaker = await SpeakerService.ensureSpeaker(conversationDbId, respondentName);

    // Optional: upload recording (unless caller provided an existing recordingId)
    const recording = recordingId
      ? ({ id: recordingId } as DbRecording)
      : recordingFile
      ? await RecordingService.upload(recordingFile, recordingDurationMs)
      : null;

    // Next turn_number
    const { data: last, error: lastErr } = await supabase
      .from('anthology_responses')
      .select('turn_number')
      .eq('conversation_id', conversationDbId)
      .order('turn_number', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastErr) {
      throw lastErr;
    }

    const nextTurn = (last?.turn_number ?? 0) + 1;

    const { data: response, error } = await supabase
      .from('anthology_responses')
      .insert({
        conversation_id: conversationDbId,
        responds_to_response_id: parentResponseDbId,
        speaker_id: speaker.id,
        speaker_name: respondentName,
        speaker_text: speakerText,
        recording_id: recording?.id,
        audio_start_ms: 0,
        audio_end_ms: recordingDurationMs ?? 0,
        turn_number: nextTurn,
      })
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return response as DbResponse;
  },
};

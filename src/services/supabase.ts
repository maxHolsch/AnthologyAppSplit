/**
 * Supabase Service Layer
 *
 * Canonical Anthology service layer.
 * Uses prefixed tables: "anthology_*".
 */

import { createClient } from '@supabase/supabase-js';
import type {
  Conversation,
  QuestionNode,
  ResponseNode,
  NarrativeNode,
  WordTimestamp
} from '@/types/data.types';

import { DEFAULT_PALETTE, buildSpeakerColorScheme } from '@/utils/colorAssignment';
import { parseVectorString } from '@/utils/semanticLayout';

// ============================================
// SUPABASE CLIENT
// ============================================

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('⚠️  Supabase credentials not found. Check anthology-app/.env');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ============================================
// ANTHOLOGIES (top-level)
// ============================================

export interface AnthologySummary {
  id: string;
  slug: string;
  title: string;
  description?: string | null;
  created_at?: string;
}

export const AnthologyService = {
  async listPublic(): Promise<AnthologySummary[]> {
    // If credentials are missing, return a safe fallback so the homepage still works.
    if (!supabaseUrl || !supabaseAnonKey) {
      return [{ id: 'default', slug: 'default', title: 'Default Anthology', description: null }];
    }

    const { data, error } = await supabase
      .from('anthology_anthologies')
      .select('id, slug, title, description, created_at')
      .eq('is_public', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Error fetching anthologies:', error);
      return [{ id: 'default', slug: 'default', title: 'Default Anthology', description: null }];
    }

    const rows = (data || []) as AnthologySummary[];
    if (rows.length === 0) {
      return [{ id: 'default', slug: 'default', title: 'Default Anthology', description: null }];
    }
    return rows;
  },

  async getBySlug(slug: string): Promise<AnthologySummary | null> {
    const { data, error } = await supabase
      .from('anthology_anthologies')
      .select('id, slug, title, description, created_at')
      .eq('slug', slug)
      .maybeSingle();

    if (error) {
      console.warn('Error fetching anthology by slug:', error);
      return null;
    }

    return (data as AnthologySummary) || null;
  },
};

// ============================================
// ANTHOLOGY HELPERS (multi-anthology support)
// ============================================

async function getAnthologyIdForConversation(conversationDbId: string): Promise<string> {
  const { data, error } = await supabase
    .from('anthology_conversations')
    .select('anthology_id')
    .eq('id', conversationDbId)
    .single();

  if (error) {
    throw error;
  }

  if (!data?.anthology_id) {
    throw new Error('Conversation has no anthology_id (schema migration may be incomplete)');
  }

  return data.anthology_id as string;
}

// ============================================
// STORAGE
// ============================================

// NOTE: Supabase bucket names are case-sensitive. This project uses the bucket
// named "Recordings" (capital R) in the Supabase dashboard.
const RECORDINGS_BUCKET = import.meta.env.VITE_SUPABASE_RECORDINGS_BUCKET || 'Recordings';

// Conversations upload bucket (for creator flow)
const CONVERSATIONS_BUCKET = import.meta.env.VITE_SUPABASE_CONVERSATIONS_BUCKET || 'Conversations';

// ============================================
// COLOR HELPERS (for new speakers)
// ============================================

const pickSpeakerBaseColor = (index: number) => DEFAULT_PALETTE[index % DEFAULT_PALETTE.length];

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
  embedding?: string; // PostgreSQL vector stored as string
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

// ============================================
// CONVERSATION SERVICE
// ============================================

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
// NARRATIVE SERVICE
// ============================================

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
        id,
        legacy_id,
        conversation_id,
        responds_to_question_id,
        responds_to_response_id,
        responds_to_narrative_id,
        speaker_name,
        speaker_text,
        pull_quote,
        audio_start_ms,
        audio_end_ms,
        turn_number,
        chronological_turn_number,
        embedding,
        medium,
        synchronicity,
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

    console.log('[ResponseService] Sample response from DB:', data[0]);

    return data.map((r: any) => {
      // IMPORTANT:
      // - We intentionally do NOT expand the parent question/response relationship here.
      //   PostgREST relationship names can vary across Supabase projects, and self-joins
      //   often fail with PGRST200 (schema cache mismatch).
      // - Instead, we return the raw FK UUID in `responds_to` and canonicalize it inside
      //   GraphDataService.loadAll() once we have all questions/responses loaded.
      const respondsToFk = (r.responds_to_question_id || r.responds_to_response_id || '') as string;

      // Parse embedding from PostgreSQL vector string to number array
      const embedding = parseVectorString(r.embedding);

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
        turn_number: r.turn_number,
        chronological_turn_number: r.chronological_turn_number,
        embedding: embedding || undefined, // Include embedding if available
        medium: r.medium,  // 'audio' or 'text'
        synchronicity: r.synchronicity,  // 'sync' or 'asynchronous'
        responds_to_narrative_id: r.responds_to_narrative_id,  // Narrative ID for narrative view
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
  async loadAll(opts?: { anthologySlug?: string }) {
    console.log('[GraphDataService] loadAll called with opts:', opts);
    try {
      // Load conversations (optionally scoped to an anthology)
      let anthologyId: string | undefined;
      if (opts?.anthologySlug) {
        const anthology = await AnthologyService.getBySlug(opts.anthologySlug);
        anthologyId = anthology?.id;

        // If user navigated to a slug that doesn't exist, return empty dataset.
        if (!anthologyId) {
          console.warn('Anthology slug not found:', opts.anthologySlug);
          return { conversations: [], questions: [], narratives: [], responses: [] };
        }
      }

      const conversations = await ConversationService.getAll({ anthologyId });

      if (conversations.length === 0) {
        console.warn('No conversations found in database');
        return { conversations: [], questions: [], narratives: [], responses: [] };
      }

      // Load questions, narratives and responses for all conversations
      const allQuestions: QuestionNode[] = [];
      const allNarratives: NarrativeNode[] = [];
      const allResponses: ResponseNode[] = [];

      for (const conv of conversations) {
        // Use the database UUID for queries, not the legacy_id
        const dbId = (conv as any)._db_id || conv.conversation_id;

        const questions = await QuestionService.getByConversation(dbId);
        const narratives = await NarrativeService.getByConversation(dbId);
        const responses = await ResponseService.getByConversation(dbId);

        // Get speaker colors for this conversation
        const speakers = await ConversationService.getSpeakers(dbId);

        // Add speaker colors to conversation metadata
        if (speakers.size > 0) {
          conv.metadata.speaker_colors = Object.fromEntries(speakers);
        }

        allQuestions.push(...questions);
        allNarratives.push(...narratives);
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

      // Attach word timestamps (for karaoke highlighting) when available.
      // We fetch in batches to avoid a per-response query.
      const responseDbIds = canonicalResponses
        .map((r: any) => r?._db_id)
        .filter((id: any): id is string => typeof id === 'string' && id.length > 0);

      if (responseDbIds.length > 0) {
        const byResponseDbId = new Map<string, WordTimestamp[]>();

        console.log('[GraphDataService] Fetching word timestamps for', responseDbIds.length, 'responses');

        const batchSize = 500;
        for (let i = 0; i < responseDbIds.length; i += batchSize) {
          const batch = responseDbIds.slice(i, i + batchSize);
          const { data: words, error: wordsErr } = await supabase
            .from('anthology_word_timestamps')
            .select('*')
            .in('response_id', batch)
            .order('response_id', { ascending: true })
            .order('word_order', { ascending: true });

          if (wordsErr) {
            console.warn('Failed to load word timestamps:', wordsErr);
            break;
          }

          console.log('[GraphDataService] Fetched', words?.length ?? 0, 'word timestamp rows');

          (words || []).forEach((w: any) => {
            const responseId = w.response_id as string | undefined;
            if (!responseId) return;
            const arr = byResponseDbId.get(responseId) || [];
            arr.push({
              text: w.text,
              start: w.start_ms,
              end: w.end_ms,
              confidence: w.confidence || 0,
              speaker: w.speaker || '',
            });
            byResponseDbId.set(responseId, arr);
          });
        }

        console.log('[GraphDataService] Word timestamps grouped for', byResponseDbId.size, 'responses');

        let attachedCount = 0;
        canonicalResponses.forEach((r: any) => {
          if (Array.isArray(r.word_timestamps) && r.word_timestamps.length > 0) return;
          const dbId = r?._db_id;
          if (typeof dbId !== 'string') return;
          const words = byResponseDbId.get(dbId);
          if (words && words.length > 0) {
            r.word_timestamps = words;
            attachedCount++;
          }
        });

        console.log('[GraphDataService] Attached word timestamps to', attachedCount, 'responses');
      }

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
        narratives: allNarratives,
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
// CONVERSATION UPLOADS (Create Anthology flow)
// ============================================

export const ConversationUploadService = {
  async uploadConversations({
    anthologyFolderSlug,
    files,
  }: {
    anthologyFolderSlug: string;
    files: File[];
  }): Promise<Array<{ fileName: string; ok: boolean; path?: string; error?: string }>> {
    const safeSlug = anthologyFolderSlug || 'untitled';

    const results: Array<{ fileName: string; ok: boolean; path?: string; error?: string }> = [];

    for (const file of files) {
      const fileName = file.name;
      const objectPath = `upload_conversations/${safeSlug}/${Date.now()}_${fileName}`;

      const { error } = await supabase.storage
        .from(CONVERSATIONS_BUCKET)
        .upload(objectPath, file, {
          contentType: file.type || undefined,
          upsert: false,
        });

      if (error) {
        results.push({ fileName, ok: false, error: error.message });
      } else {
        results.push({ fileName, ok: true, path: objectPath });
      }
    }

    return results;
  },
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
    const anthologyId = await getAnthologyIdForConversation(conversationId);

    // 1. Upload recording
    const recording = await RecordingService.upload(recordingFile);
    if (!recording) {
      throw new Error('Failed to upload recording');
    }

    // 2. Get or create speaker
    const { data: speaker } = await supabase
      .from('anthology_speakers')
      .select('id')
      .eq('anthology_id', anthologyId)
      .eq('conversation_id', conversationId)
      .eq('name', speakerName)
      .single();

    // 3. Create response
    const { data: response, error } = await supabase
      .from('anthology_responses')
      .insert({
        anthology_id: anthologyId,
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
    wordTimestamps,
  }: {
    conversationId: string; // legacy id or db uuid
    parentResponseId: string; // legacy id or db uuid
    respondentName: string;
    speakerText: string;
    recordingFile?: File;
    recordingId?: string;
    recordingDurationMs?: number;
    wordTimestamps?: WordTimestamp[];
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

    const anthologyId = await getAnthologyIdForConversation(conversationDbId);

    // Resolve parent response DB id (UUID)
    const parentResponseDbId = await (async () => {
      const { data, error } = await supabase
        .from('anthology_responses')
        .select('id')
        .eq('anthology_id', anthologyId)
        .eq('legacy_id', parentResponseId)
        .maybeSingle();

      if (error) {
        throw error;
      }
      return data?.id || parentResponseId;
    })();

    // Ensure speaker exists
    const speaker = await SpeakerService.ensureSpeaker(conversationDbId, respondentName, { anthologyId });

    // Optional: upload recording (unless caller provided an existing recordingId)
    const recording = recordingId
      ? ({ id: recordingId } as DbRecording)
      : recordingFile
        ? await RecordingService.upload(recordingFile, recordingDurationMs)
        : null;

    // If we attach a recording to the response, we must also provide a valid audio range.
    // The DB enforces this via the `valid_audio_range` CHECK constraint.
    const hasRecording = !!recording?.id;
    if (hasRecording && (!recordingDurationMs || recordingDurationMs <= 0)) {
      throw new Error('recordingDurationMs is required (> 0) when attaching a recording to a response');
    }

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

    // Assign narrative based on semantic similarity
    let narrativeId: string | null = null;
    try {
      console.log('[AdminService.addResponseToResponse] Calling assign-narrative API...');
      const response = await fetch('/api/assign-narrative', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          anthologyId,
          responseText: speakerText
        })
      });

      console.log('[AdminService.addResponseToResponse] API response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        narrativeId = data.narrativeId;
        console.log('[AdminService.addResponseToResponse] ✅ Assigned narrative:', {
          narrativeId,
          similarity: data.similarity
        });
      } else {
        const errorText = await response.text();
        console.warn('[AdminService.addResponseToResponse] ❌ Failed to assign narrative:', {
          status: response.status,
          error: errorText
        });
      }
    } catch (error) {
      console.error('[AdminService.addResponseToResponse] ❌ Error calling assign-narrative API:', error);
    }

    const { data: response, error } = await supabase
      .from('anthology_responses')
      .insert({
        anthology_id: anthologyId,
        conversation_id: conversationDbId,
        responds_to_response_id: parentResponseDbId,
        responds_to_narrative_id: narrativeId,
        speaker_id: speaker.id,
        speaker_name: respondentName,
        speaker_text: speakerText,
        recording_id: hasRecording ? recording!.id : null,
        audio_start_ms: hasRecording ? 0 : null,
        audio_end_ms: hasRecording ? recordingDurationMs! : null,
        turn_number: nextTurn,
        medium: hasRecording ? 'audio' : 'text',  // Determine based on recording presence
        synchronicity: 'asynchronous',  // User-added responses are asynchronous
      })
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    // Persist word timestamps (for karaoke highlighting)
    if (Array.isArray(wordTimestamps) && wordTimestamps.length > 0) {
      console.log('[AdminService.addResponseToResponse] Inserting word timestamps:', {
        responseId: response.id,
        wordCount: wordTimestamps.length,
      });

      const rows = wordTimestamps
        .filter((w) => typeof w.text === 'string' && typeof w.start === 'number' && typeof w.end === 'number')
        .map((w, idx) => ({
          response_id: response.id,
          text: w.text,
          start_ms: w.start,
          end_ms: w.end,
          confidence: typeof w.confidence === 'number' ? w.confidence : null,
          speaker: typeof w.speaker === 'string' ? w.speaker : null,
          word_order: idx,
        }));

      if (rows.length > 0) {
        const { error: wordsErr } = await supabase.from('anthology_word_timestamps').insert(rows);
        if (wordsErr) {
          console.warn('Failed to insert word timestamps (karaoke will fallback to plain text):', wordsErr);
        } else {
          console.log('[AdminService.addResponseToResponse] Word timestamps inserted successfully:', rows.length);
        }
      }
    } else {
      console.warn('[AdminService.addResponseToResponse] No word timestamps provided for response:', response.id);
    }

    return response as DbResponse;
  },

  /**
   * Add a new response that responds to a QUESTION node.
   * Used by the global "Add your voice" flow.
   */
  async addResponseToQuestion({
    conversationId,
    questionId, // optional
    respondentName,
    speakerText,
    recordingFile,
    recordingId,
    recordingDurationMs,
    wordTimestamps,
  }: {
    conversationId: string; // legacy id or db uuid
    questionId?: string; // legacy id or db uuid
    respondentName: string;
    speakerText: string;
    recordingFile?: File;
    recordingId?: string;
    recordingDurationMs?: number;
    wordTimestamps?: WordTimestamp[];
  }) {
    // Resolve conversation DB id (UUID)
    const conversationDbId = await (async () => {
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

    const anthologyId = await getAnthologyIdForConversation(conversationDbId);

    // Resolve question DB id (UUID)
    const questionDbId = await (async () => {
      if (!questionId) return null;
      const { data, error } = await supabase
        .from('anthology_questions')
        .select('id')
        .eq('anthology_id', anthologyId)
        .eq('legacy_id', questionId)
        .maybeSingle();

      if (error) {
        throw error;
      }
      return data?.id || questionId;
    })();

    // Ensure speaker exists
    const speaker = await SpeakerService.ensureSpeaker(conversationDbId, respondentName, { anthologyId });

    // Optional: upload recording (unless caller provided an existing recordingId)
    const recording = recordingId
      ? ({ id: recordingId } as DbRecording)
      : recordingFile
        ? await RecordingService.upload(recordingFile, recordingDurationMs)
        : null;

    const hasRecording = !!recording?.id;
    if (hasRecording && (!recordingDurationMs || recordingDurationMs <= 0)) {
      throw new Error('recordingDurationMs is required (> 0) when attaching a recording to a response');
    }

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

    // Assign narrative based on semantic similarity
    let narrativeId: string | null = null;
    try {
      console.log('[AdminService.addResponseToQuestion] Calling assign-narrative API...');
      const response = await fetch('/api/assign-narrative', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          anthologyId,
          responseText: speakerText
        })
      });

      console.log('[AdminService.addResponseToQuestion] API response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        narrativeId = data.narrativeId;
        console.log('[AdminService.addResponseToQuestion] ✅ Assigned narrative:', {
          narrativeId,
          similarity: data.similarity
        });
      } else {
        const errorText = await response.text();
        console.warn('[AdminService.addResponseToQuestion] ❌ Failed to assign narrative:', {
          status: response.status,
          error: errorText
        });
      }
    } catch (error) {
      console.error('[AdminService.addResponseToQuestion] ❌ Error calling assign-narrative API:', error);
    }

    console.log('[AdminService.addResponseToQuestion] Inserting response:', {
      anthologyId,
      conversationDbId,
      questionDbId,
      respondentName,
      nextTurn,
      hasRecording,
      narrativeId
    });

    const { data: response, error } = await supabase
      .from('anthology_responses')
      .insert({
        anthology_id: anthologyId,
        conversation_id: conversationDbId,
        responds_to_question_id: questionDbId,
        responds_to_narrative_id: narrativeId,
        speaker_id: speaker.id,
        speaker_name: respondentName,
        speaker_text: speakerText,
        recording_id: hasRecording ? recording!.id : null,
        audio_start_ms: hasRecording ? 0 : null,
        audio_end_ms: hasRecording ? recordingDurationMs! : null,
        turn_number: nextTurn,
        medium: hasRecording ? 'audio' : 'text',  // Determine based on recording presence
        synchronicity: 'asynchronous',  // User-added responses are asynchronous
      })
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    // Persist word timestamps (for karaoke highlighting)
    if (Array.isArray(wordTimestamps) && wordTimestamps.length > 0) {
      console.log('[AdminService.addResponseToQuestion] Inserting word timestamps:', {
        responseId: response.id,
        wordCount: wordTimestamps.length,
      });

      const rows = wordTimestamps
        .filter((w) => typeof w.text === 'string' && typeof w.start === 'number' && typeof w.end === 'number')
        .map((w, idx) => ({
          response_id: response.id,
          text: w.text,
          start_ms: w.start,
          end_ms: w.end,
          confidence: typeof w.confidence === 'number' ? w.confidence : null,
          speaker: typeof w.speaker === 'string' ? w.speaker : null,
          word_order: idx,
        }));

      if (rows.length > 0) {
        const { error: wordsErr } = await supabase.from('anthology_word_timestamps').insert(rows);
        if (wordsErr) {
          console.warn('Failed to insert word timestamps (karaoke will fallback to plain text):', wordsErr);
        } else {
          console.log('[AdminService.addResponseToQuestion] Word timestamps inserted successfully:', rows.length);
        }
      }
    } else {
      console.warn('[AdminService.addResponseToQuestion] No word timestamps provided for response:', response.id);
    }

    return response as DbResponse;
  },
};

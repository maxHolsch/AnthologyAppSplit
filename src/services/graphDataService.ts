/**
 * Graph Data Service
 * Main entry point for loading complete graph data for visualization
 */

import type { WordTimestamp } from '@/types/data.types';
import { supabase } from './supabaseClient';
import { AnthologyService } from './anthologyService';
import { ConversationService } from './conversationService';
import { QuestionService } from './questionService';
import { NarrativeService } from './narrativeService';
import { ResponseService } from './responseService';

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
      const allQuestions: any[] = [];
      const allNarratives: any[] = [];
      const allResponses: any[] = [];

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

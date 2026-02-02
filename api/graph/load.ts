/**
 * API endpoint: GET /api/graph/load
 * Composite endpoint that loads complete graph data for visualization
 * This replaces the graphDataService.loadAll() function on the frontend
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../_lib/supabase';
import { jsonResponse, handleError, errorResponse } from '../_lib/response';
import { GraphLoadQuerySchema, safeParseQuery } from '../_lib/validation';
import { ErrorCodes } from '../_lib/errors';
import type {
  ApiConversation,
  ApiQuestion,
  ApiNarrative,
  ApiResponse,
  ApiGraphData,
  ApiWordTimestamp,
} from '../../shared/types/api.types';

/**
 * Parse PostgreSQL vector string to number array
 */
function parseVectorString(embedding: unknown): number[] | undefined {
  if (!embedding) return undefined;

  if (Array.isArray(embedding)) {
    return embedding;
  }

  if (typeof embedding === 'string') {
    if (embedding.startsWith('[') && embedding.endsWith(']')) {
      try {
        return embedding
          .slice(1, -1)
          .split(',')
          .map((s) => parseFloat(s.trim()));
      } catch {
        return undefined;
      }
    }
  }

  return undefined;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return errorResponse(res, ErrorCodes.METHOD_NOT_ALLOWED, 'Method not allowed', {
      allowedMethods: ['GET'],
    });
  }

  try {
    const parsed = safeParseQuery(GraphLoadQuerySchema, req.query);

    if (!parsed.success) {
      return errorResponse(res, ErrorCodes.VALIDATION_ERROR, 'Invalid parameters', {
        fieldErrors: parsed.error.flatten().fieldErrors,
      });
    }

    const { anthologySlug, anthologyId: providedAnthologyId } = parsed.data;

    // Resolve anthology ID
    let anthologyId: string | undefined = providedAnthologyId;

    if (anthologySlug && !anthologyId) {
      const { data: anthology, error: anthologyError } = await supabase
        .from('anthology_anthologies')
        .select('id')
        .eq('slug', anthologySlug)
        .maybeSingle();

      if (anthologyError) {
        console.error('[GET /api/graph/load] Error fetching anthology:', anthologyError);
        return errorResponse(res, ErrorCodes.DATABASE_ERROR, 'Failed to fetch anthology');
      }

      if (!anthology) {
        console.warn('[GET /api/graph/load] Anthology slug not found:', anthologySlug);
        return jsonResponse(res, {
          conversations: [],
          questions: [],
          narratives: [],
          responses: [],
        } as ApiGraphData);
      }

      anthologyId = anthology.id;
    }

    // Load conversations
    let convQuery = supabase
      .from('anthology_conversations')
      .select(
        `
        id,
        legacy_id,
        anthology_id,
        title,
        date,
        color,
        participants,
        location,
        facilitator,
        topics,
        source_transcript,
        metadata,
        created_at,
        anthology_conversation_recordings!inner (
          is_primary,
          recording_id,
          anthology_recordings (
            file_path,
            duration_ms
          )
        )
      `
      )
      .order('created_at', { ascending: false });

    if (anthologyId) {
      convQuery = convQuery.eq('anthology_id', anthologyId);
    }

    const { data: conversationsData, error: convError } = await convQuery;

    if (convError) {
      console.error('[GET /api/graph/load] Error fetching conversations:', convError);
      return errorResponse(res, ErrorCodes.DATABASE_ERROR, 'Failed to fetch conversations');
    }

    if (!conversationsData || conversationsData.length === 0) {
      console.warn('[GET /api/graph/load] No conversations found');
      return jsonResponse(res, {
        conversations: [],
        questions: [],
        narratives: [],
        responses: [],
      } as ApiGraphData);
    }

    // Get conversation IDs for subsequent queries
    const conversationIds = conversationsData.map((c: any) => c.id);

    // Load speakers for all conversations
    const { data: speakersData, error: speakersError } = await supabase
      .from('anthology_speakers')
      .select('*')
      .in('conversation_id', conversationIds);

    if (speakersError) {
      console.error('[GET /api/graph/load] Error fetching speakers:', speakersError);
    }

    // Group speakers by conversation
    const speakersByConversation = new Map<string, Map<string, any>>();
    (speakersData || []).forEach((speaker: any) => {
      const convId = speaker.conversation_id;
      if (!speakersByConversation.has(convId)) {
        speakersByConversation.set(convId, new Map());
      }
      speakersByConversation.get(convId)!.set(speaker.name, {
        circle: speaker.circle_color,
        fadedCircle: speaker.faded_circle_color,
        quoteRectangle: speaker.quote_rectangle_color,
        fadedQuoteRectangle: speaker.faded_quote_rectangle_color,
        quoteText: speaker.quote_text_color,
        fadedQuoteText: speaker.faded_quote_text_color,
      });
    });

    // Transform conversations
    const conversations: ApiConversation[] = conversationsData.map((row: any) => {
      const primaryRecordingLink = row.anthology_conversation_recordings?.find(
        (cr: any) => cr.is_primary
      );
      const primaryRecording = primaryRecordingLink?.anthology_recordings;

      // Get speaker colors for this conversation
      const speakerColors = speakersByConversation.get(row.id);
      const speakerColorsObj = speakerColors
        ? Object.fromEntries(speakerColors)
        : row.metadata?.speaker_colors;

      return {
        id: row.id,
        legacyId: row.legacy_id,
        anthologyId: row.anthology_id,
        audioFile: primaryRecording?.file_path || '',
        duration: primaryRecording?.duration_ms || 0,
        color: row.color,
        metadata: {
          title: row.title,
          date: row.date || '',
          participants: row.participants || [],
          speakerColors: speakerColorsObj,
          location: row.location,
          facilitator: row.facilitator,
          topics: row.topics || [],
          sourceTranscript: row.source_transcript,
          ...row.metadata,
        },
        createdAt: row.created_at,
      };
    });

    // Load questions for all conversations
    const { data: questionsData, error: questionsError } = await supabase
      .from('anthology_questions')
      .select(
        `
        *,
        recording:anthology_recordings (file_path)
      `
      )
      .in('conversation_id', conversationIds)
      .order('created_at', { ascending: true });

    if (questionsError) {
      console.error('[GET /api/graph/load] Error fetching questions:', questionsError);
      return errorResponse(res, ErrorCodes.DATABASE_ERROR, 'Failed to fetch questions');
    }

    // Build question ID maps for canonical ID resolution
    const questionDbIdToCanonicalId = new Map<string, string>();
    (questionsData || []).forEach((q: any) => {
      questionDbIdToCanonicalId.set(q.id, q.legacy_id || q.id);
    });

    // Load narratives for all conversations
    const { data: narrativesData, error: narrativesError } = await supabase
      .from('anthology_narratives')
      .select('*')
      .in('conversation_id', conversationIds)
      .order('created_at', { ascending: true });

    if (narrativesError) {
      console.error('[GET /api/graph/load] Error fetching narratives:', narrativesError);
      return errorResponse(res, ErrorCodes.DATABASE_ERROR, 'Failed to fetch narratives');
    }

    // Load responses for all conversations
    const { data: responsesData, error: responsesError } = await supabase
      .from('anthology_responses')
      .select(
        `
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
        created_at,
        recording:anthology_recordings (file_path),
        conversation:anthology_conversations!conversation_id (id, legacy_id)
      `
      )
      .in('conversation_id', conversationIds)
      .order('turn_number', { ascending: true });

    if (responsesError) {
      console.error('[GET /api/graph/load] Error fetching responses:', responsesError);
      return errorResponse(res, ErrorCodes.DATABASE_ERROR, 'Failed to fetch responses');
    }

    // Build response ID map for canonical ID resolution
    const responseDbIdToCanonicalId = new Map<string, string>();
    (responsesData || []).forEach((r: any) => {
      responseDbIdToCanonicalId.set(r.id, r.legacy_id || r.id);
    });

    // Function to canonicalize node ID
    const canonicalizeNodeId = (maybeDbId: string | null | undefined): string | null => {
      if (!maybeDbId) return null;
      return (
        questionDbIdToCanonicalId.get(maybeDbId) ||
        responseDbIdToCanonicalId.get(maybeDbId) ||
        maybeDbId
      );
    };

    // Load word timestamps for all responses in batches
    const responseDbIds = (responsesData || [])
      .map((r: any) => r.id)
      .filter((id: any): id is string => typeof id === 'string' && id.length > 0);

    const wordTimestampsByResponse = new Map<string, ApiWordTimestamp[]>();

    if (responseDbIds.length > 0) {
      const batchSize = 500;
      for (let i = 0; i < responseDbIds.length; i += batchSize) {
        const batch = responseDbIds.slice(i, i + batchSize);
        const { data: wordsData, error: wordsError } = await supabase
          .from('anthology_word_timestamps')
          .select('*')
          .in('response_id', batch)
          .order('response_id', { ascending: true })
          .order('word_order', { ascending: true });

        if (wordsError) {
          console.warn('[GET /api/graph/load] Error fetching word timestamps:', wordsError);
          break;
        }

        (wordsData || []).forEach((w: any) => {
          const responseId = w.response_id as string | undefined;
          if (!responseId) return;
          const arr = wordTimestampsByResponse.get(responseId) || [];
          arr.push({
            text: w.text,
            start: w.start_ms,
            end: w.end_ms,
            confidence: w.confidence || 0,
            speaker: w.speaker || '',
          });
          wordTimestampsByResponse.set(responseId, arr);
        });
      }
    }

    // Transform responses with canonical IDs and word timestamps
    const responses: ApiResponse[] = (responsesData || []).map((row: any) => ({
      id: row.legacy_id || row.id,
      legacyId: row.legacy_id,
      conversationId: row.conversation?.legacy_id || row.conversation?.id || row.conversation_id,
      respondsToQuestionId: canonicalizeNodeId(row.responds_to_question_id),
      respondsToResponseId: canonicalizeNodeId(row.responds_to_response_id),
      respondsToNarrativeId: row.responds_to_narrative_id,
      speakerName: row.speaker_name,
      speakerText: row.speaker_text,
      pullQuote: row.pull_quote,
      audioStartMs: row.audio_start_ms,
      audioEndMs: row.audio_end_ms,
      turnNumber: row.turn_number,
      chronologicalTurnNumber: row.chronological_turn_number,
      pathToRecording: row.recording?.file_path,
      medium: row.medium,
      synchronicity: row.synchronicity,
      embedding: parseVectorString(row.embedding),
      wordTimestamps: wordTimestampsByResponse.get(row.id),
      createdAt: row.created_at,
      // Include internal DB ID for reference (prefixed to indicate internal use)
      _dbId: row.id,
    }));

    // Transform questions with related responses
    const questions: ApiQuestion[] = (questionsData || []).map((row: any) => {
      const questionCanonicalId = row.legacy_id || row.id;
      const relatedResponses = responses
        .filter((r) => r.respondsToQuestionId === questionCanonicalId)
        .map((r) => r.id);

      return {
        id: questionCanonicalId,
        legacyId: row.legacy_id,
        conversationId: row.conversation_id,
        questionText: row.question_text,
        relatedResponses,
        facilitator: row.facilitator,
        notes: row.notes,
        pathToRecording: row.recording?.file_path,
        audioStartMs: row.audio_start_ms,
        audioEndMs: row.audio_end_ms,
        createdAt: row.created_at,
        // Include internal DB ID for reference
        _dbId: row.id,
      };
    });

    // Transform narratives
    const narratives: ApiNarrative[] = (narrativesData || []).map((row: any) => ({
      id: row.legacy_id || row.id,
      legacyId: row.legacy_id,
      anthologyId: row.anthology_id,
      conversationId: row.conversation_id,
      narrativeText: row.narrative_text,
      relatedResponses: [], // Can be populated if needed
      notes: row.notes,
      color: row.color,
      embedding: parseVectorString(row.embedding),
      createdAt: row.created_at,
      // Include internal DB ID for reference
      _dbId: row.id,
    }));

    const graphData: ApiGraphData = {
      conversations,
      questions,
      narratives,
      responses,
    };

    return jsonResponse(res, graphData);
  } catch (error) {
    return handleError(res, error);
  }
}

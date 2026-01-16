/**
 * Admin Service
 * Handles adding new responses and user-generated content
 */

import type { WordTimestamp } from '@/types/data.types';
import { supabase, type DbResponse } from './supabaseClient';
import { RecordingService } from './recordingService';
import { SpeakerService, getAnthologyIdForConversation } from './speakerService';
import type { DbRecording } from './supabaseClient';

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

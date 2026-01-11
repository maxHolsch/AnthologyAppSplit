/**
 * Data transformation utilities
 * Converts between different JSON formats for anthology data
 */

import type { AnthologyData, ResponseNode, QuestionNode } from '@types';

/**
 * Transform the new "transcript_analysis_with_reply_metadata" format
 * to the standard AnthologyData format expected by the app
 */
export function transformReplyMetadataFormat(data: any): AnthologyData {
  // If already in the correct format, return as-is
  if (data.responses && data.questions) {
    return data as AnthologyData;
  }

  // Transform facilitator_questions → questions
  const questions: QuestionNode[] = (data.facilitator_questions || []).map((q: any) => ({
    type: 'question' as const,
    id: q.id,
    question_text: q.text,
    related_responses: [], // Will be populated from excerpts
    facilitator: data.metadata?.facilitators?.[0] || '',
    notes: ''
  }));

  // Create a map to track which responses belong to which questions
  const questionResponsesMap = new Map<string, string[]>();

  // Transform excerpts → responses
  const responses: ResponseNode[] = (data.excerpts || []).map((excerpt: any) => {
    const response: ResponseNode = {
      type: 'response' as const,
      id: excerpt.id,
      responds_to: excerpt.question_id, // Keep for fallback
      speaker_name: excerpt.speaker,
      speaker_text: excerpt.text,
      pull_quote: excerpt.pull_quote || undefined,
      audio_start: 0, // Not provided in new format, default to 0
      audio_end: 1000, // Default duration
      conversation_id: 'conv_default', // Single conversation for this format
      turn_number: excerpt.page,
      // Include new reply metadata
      reply_to_primary: excerpt.reply_to_primary,
      reply_type: excerpt.reply_type,
      reply_confidence: excerpt.reply_confidence,
      reply_reason: excerpt.reply_reason,
      metadata: {
        theme_ids: excerpt.theme_ids || [],
        narrative_ids: excerpt.narrative_ids || [],
        page: excerpt.page
      }
    };

    // Track which responses belong to which questions
    if (excerpt.question_id) {
      if (!questionResponsesMap.has(excerpt.question_id)) {
        questionResponsesMap.set(excerpt.question_id, []);
      }
      questionResponsesMap.get(excerpt.question_id)!.push(excerpt.id);
    }

    return response;
  });

  // Update questions with their related responses
  questions.forEach(question => {
    question.related_responses = questionResponsesMap.get(question.id) || [];
  });

  // Create a default conversation
  const conversations = [{
    conversation_id: 'conv_default',
    audio_file: '', // No audio in this format
    duration: 0,
    color: '#4A90E2',
    metadata: {
      title: data.metadata?.title || 'Untitled',
      date: new Date().toISOString(),
      participants: (data.metadata?.participants || []).map((p: any) => p.name || p.id),
      facilitator: data.metadata?.facilitators?.[0] || '',
      topics: [],
      source_transcript: data.metadata?.source || ''
    }
  }];

  return {
    conversations,
    questions,
    responses,
    prompts: []
  };
}

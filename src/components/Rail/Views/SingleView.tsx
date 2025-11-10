/**
 * SingleView - Full display of a single response with audio playback
 * Visual Reference: https://www.figma.com/design/3RRAJtxVKX0kbSZT8ouJWa/Anthology-III?node-id=207-1114&m=dev
 */

import { memo, useMemo } from 'react';
import { useAnthologyStore } from '@stores';
import { BackButton } from '../Components/BackButton';
import { SpeakerHeader } from '../Components/SpeakerHeader';
import { QuestionContext } from '../Components/QuestionContext';
import { AudioPlayer } from '@components/Audio/AudioPlayer';
import { HighlightedText } from '@components/Audio/HighlightedText';
import styles from './SingleView.module.css';

export const SingleView = memo(() => {
  const activeResponse = useAnthologyStore(state => state.view.activeResponse);
  const responseNodes = useAnthologyStore(state => state.data.responseNodes);
  const questionNodes = useAnthologyStore(state => state.data.questionNodes);
  const conversations = useAnthologyStore(state => state.data.conversations);
  const speakerColorAssignments = useAnthologyStore(state => state.data.speakerColorAssignments);
  const setRailMode = useAnthologyStore(state => state.setRailMode);

  // Get the response data
  const response = activeResponse ? responseNodes.get(activeResponse) : null;

  // Get the parent question
  const parentQuestion = useMemo(() => {
    if (!response?.responds_to) return null;
    return questionNodes.get(response.responds_to);
  }, [response, questionNodes]);

  // Get the conversation for fallback color
  const conversation = useMemo(() => {
    if (!response?.conversation_id) return null;
    return conversations.get(response.conversation_id);
  }, [response, conversations]);

  // Resolve speaker-specific color with proper hierarchy
  const speakerColor = useMemo(() => {
    if (!response) return '#999999'; // Grey fallback

    // Build the speaker color key (conversationId:speakerName)
    const speakerColorKey = `${response.conversation_id}:${response.speaker_name}`;
    const colorScheme = speakerColorAssignments.get(speakerColorKey)?.color;

    // Priority: speaker color > conversation color > grey fallback
    const resolvedColor = colorScheme || conversation?.color || '#999999';

    // Handle SpeakerColorScheme objects (extract circle property for avatar)
    if (typeof resolvedColor === 'string') {
      return resolvedColor;
    }
    // For SpeakerColorScheme objects, use the circle color
    return resolvedColor.circle;
  }, [response, speakerColorAssignments, conversation]);

  const handleBack = () => {
    if (parentQuestion) {
      setRailMode('question');
    } else {
      setRailMode('conversations');
    }
  };

  if (!response) {
    return (
      <div className={styles.emptyState}>
        <p>No response selected</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <BackButton onClick={handleBack} />

      <div className={styles.content}>
        <SpeakerHeader
          speakerName={response.speaker_name}
          color={speakerColor}
        />

        {parentQuestion && (
          <QuestionContext questionText={parentQuestion.question_text} />
        )}

        <div className={styles.audioSection}>
          <AudioPlayer response={response} />
        </div>

        <div className={styles.responseText}>
          <HighlightedText response={response} />
        </div>
      </div>
    </div>
  );
});

SingleView.displayName = 'SingleView';
/**
 * SingleView - Full display of a single response with audio playback
 */

import { memo, useMemo } from 'react';
import { useAnthologyStore } from '@stores';
import { QuestionContext } from '../Components/QuestionContext';
import { AudioPlayer } from '@components/Audio/AudioPlayer';
import { HighlightedText } from '@components/Audio/HighlightedText';
import styles from './SingleView.module.css';

export const SingleView = memo(() => {
  const activeResponse = useAnthologyStore(state => state.view.activeResponse);
  const responseNodes = useAnthologyStore(state => state.data.responseNodes);
  const questionNodes = useAnthologyStore(state => state.data.questionNodes);

  // Get the response data
  const response = activeResponse ? responseNodes.get(activeResponse) : null;

  // Get the parent question
  const parentQuestion = useMemo(() => {
    if (!response?.responds_to) return null;
    return questionNodes.get(response.responds_to);
  }, [response, questionNodes]);

  if (!response) {
    return (
      <div className={styles.emptyState}>
        <p>No response selected</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {parentQuestion && (
        <QuestionContext questionText={parentQuestion.question_text} />
      )}

      <div className={styles.responseSection}>
        <div className={styles.speakerInfo}>
          <h3 className={styles.speakerName}>{response.speaker_name}</h3>
        </div>

        <AudioPlayer response={response} />

        <div className={styles.responseText}>
          <HighlightedText response={response} />
        </div>
      </div>
    </div>
  );
});

SingleView.displayName = 'SingleView';
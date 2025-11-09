/**
 * QuestionView - Shows a question with all its connected responses
 */

import { memo, useCallback, useMemo } from 'react';
import { useAnthologyStore } from '@stores';
import { ResponseTile } from '../Components/ResponseTile';
import { MedleyPlayer } from '@components/Audio/MedleyPlayer';
import { KaraokeDisplay } from './KaraokeDisplay';
import styles from './QuestionView.module.css';

export const QuestionView = memo(() => {
  const activeQuestion = useAnthologyStore(state => state.view.activeQuestion);
  const questionNodes = useAnthologyStore(state => state.data.questionNodes);
  const responseNodes = useAnthologyStore(state => state.data.responseNodes);
  const selectResponse = useAnthologyStore(state => state.selectResponse);
  const hoverNode = useAnthologyStore(state => state.hoverNode);
  const currentTrack = useAnthologyStore(state => state.audio.currentTrack);

  // Get the question data
  const question = activeQuestion ? questionNodes.get(activeQuestion) : null;

  // Get all responses for this question
  const responses = useMemo(() => {
    if (!question) return [];
    return question.related_responses
      .map(id => responseNodes.get(id))
      .filter((r): r is NonNullable<typeof r> => r !== undefined);
  }, [question, responseNodes]);

  const responseIds = useMemo(() => {
    return responses.map(r => r.id);
  }, [responses]);

  const handleResponseClick = useCallback((responseId: string) => {
    selectResponse(responseId);
  }, [selectResponse]);

  const handleResponseHover = useCallback((responseId: string | null) => {
    hoverNode(responseId);
  }, [hoverNode]);

  if (!question) {
    return (
      <div className={styles.emptyState}>
        <p>No question selected</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.questionSection}>
        <h3 className={styles.questionText}>{question.question_text}</h3>

        {responses.length > 0 && (
          <MedleyPlayer responseIds={responseIds} />
        )}
      </div>

      {/* Karaoke Display - Shows when audio is playing */}
      {currentTrack && (
        <div className={styles.karaokeSection}>
          <KaraokeDisplay responseId={currentTrack} />
        </div>
      )}

      <div className={styles.responsesSection}>
        {responses.length === 0 ? (
          <div className={styles.emptyState}>
            <p>No responses available for this question</p>
          </div>
        ) : (
          <div className={styles.responseList}>
            {responses.map(response => (
              <ResponseTile
                key={response.id}
                response={response}
                onClick={handleResponseClick}
                onHover={handleResponseHover}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

QuestionView.displayName = 'QuestionView';
/**
 * QuestionView - Shows a question with all its connected responses
 */

import { memo, useCallback, useMemo } from 'react';
import { useAnthologyStore } from '@stores';
import { ResponseTile } from '../Components/ResponseTile';
import { MedleyPlayButton } from '../Components/MedleyPlayButton';
import styles from './QuestionView.module.css';

export const QuestionView = memo(() => {
  const activeQuestion = useAnthologyStore(state => state.view.activeQuestion);
  const questionNodes = useAnthologyStore(state => state.data.questionNodes);
  const responseNodes = useAnthologyStore(state => state.data.responseNodes);
  const selectResponse = useAnthologyStore(state => state.selectResponse);
  const hoverNode = useAnthologyStore(state => state.hoverNode);
  const audioState = useAnthologyStore(state => state.audio);
  // const play = useAnthologyStore(state => state.play); // TODO: Phase 5 audio
  const pause = useAnthologyStore(state => state.pause);
  const shufflePlay = useAnthologyStore(state => state.shufflePlay);

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

  const handlePlay = useCallback(() => {
    if (responseIds.length > 0) {
      shufflePlay(responseIds);
    }
  }, [responseIds, shufflePlay]);

  const handlePause = useCallback(() => {
    pause();
  }, [pause]);

  if (!question) {
    return (
      <div className={styles.emptyState}>
        <p>No question selected</p>
      </div>
    );
  }

  const isPlaying = audioState.playbackState === 'playing' &&
                    audioState.playbackMode === 'shuffle' &&
                    responseIds.includes(audioState.currentTrack || '');

  return (
    <div className={styles.container}>
      <div className={styles.questionSection}>
        <h3 className={styles.questionText}>{question.question_text}</h3>

        {responses.length > 0 && (
          <MedleyPlayButton
            responseIds={responseIds}
            isPlaying={isPlaying}
            currentPlayingId={audioState.currentTrack}
            onPlay={handlePlay}
            onPause={handlePause}
          />
        )}
      </div>

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
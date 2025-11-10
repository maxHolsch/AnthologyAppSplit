/**
 * QuestionView - Shows a question with all its connected responses
 * Visual Reference: https://www.figma.com/design/8rPqQMt3PEL7MhKhWqtSre/Anthology-III--Copy-?node-id=94-17360
 */

import { memo, useCallback, useMemo } from 'react';
import { useAnthologyStore } from '@stores';
import { BackButton } from '../Components/BackButton';
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
  const playbackState = useAnthologyStore(state => state.audio.playbackState);
  const setRailMode = useAnthologyStore(state => state.setRailMode);
  const zoomToFullMap = useAnthologyStore(state => state.zoomToFullMap);

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

  const handleBackClick = useCallback(() => {
    // Zoom out to full map view before changing rail mode
    zoomToFullMap();
    setRailMode('conversations');
  }, [zoomToFullMap, setRailMode]);

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
      {/* Back Button */}
      <div className={styles.backButtonContainer}>
        <BackButton onClick={handleBackClick} />
      </div>

      {/* Question Section Label */}
      <p className={styles.sectionLabel}>Question</p>

      {/* Question Text */}
      <h2 className={styles.questionText}>{question.question_text}</h2>

      {/* Large Play Button (Medley Player) */}
      {responses.length > 0 && (
        <div className={styles.playButtonContainer}>
          <MedleyPlayer responseIds={responseIds} />
        </div>
      )}

      {/* Karaoke Display - Only shows when audio is actively playing */}
      {currentTrack && playbackState === 'playing' && (
        <div className={styles.karaokeSection}>
          <KaraokeDisplay responseId={currentTrack} />
        </div>
      )}

      {/* Responses Section Label */}
      <p className={styles.responsesLabel}>RESPONSES</p>

      {/* Responses List */}
      <div className={styles.responsesSection}>
        {responses.length === 0 ? (
          <div className={styles.emptyState}>
            <p>No responses available for this question</p>
          </div>
        ) : (
          <div className={styles.responseList}>
            {responses.map((response, index) => (
              <ResponseTile
                key={response.id}
                response={response}
                onClick={handleResponseClick}
                onHover={handleResponseHover}
                showSeparator={index < responses.length - 1}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

QuestionView.displayName = 'QuestionView';
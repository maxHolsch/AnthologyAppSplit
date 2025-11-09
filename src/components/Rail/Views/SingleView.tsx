/**
 * SingleView - Full display of a single response with audio playback
 */

import { memo, useCallback, useMemo } from 'react';
import { useAnthologyStore } from '@stores';
import { QuestionContext } from '../Components/QuestionContext';
import { ResponsePlayButton } from '../Components/ResponsePlayButton';
import styles from './SingleView.module.css';

export const SingleView = memo(() => {
  const activeResponse = useAnthologyStore(state => state.view.activeResponse);
  const responseNodes = useAnthologyStore(state => state.data.responseNodes);
  const questionNodes = useAnthologyStore(state => state.data.questionNodes);
  const audioState = useAnthologyStore(state => state.audio);
  const play = useAnthologyStore(state => state.play);
  const pause = useAnthologyStore(state => state.pause);
  const seek = useAnthologyStore(state => state.seek);

  // Get the response data
  const response = activeResponse ? responseNodes.get(activeResponse) : null;

  // Get the parent question
  const parentQuestion = useMemo(() => {
    if (!response?.responds_to) return null;
    return questionNodes.get(response.responds_to);
  }, [response, questionNodes]);

  const handlePlay = useCallback(() => {
    if (response) {
      play(response.id);
    }
  }, [response, play]);

  const handlePause = useCallback(() => {
    pause();
  }, [pause]);

  const handleSeek = useCallback((time: number) => {
    seek(time);
  }, [seek]);

  if (!response) {
    return (
      <div className={styles.emptyState}>
        <p>No response selected</p>
      </div>
    );
  }

  const isPlaying = audioState.playbackState === 'playing' &&
                    audioState.currentTrack === response.id;
  const duration = response.audio_end - response.audio_start;

  // TODO: Implement word-level highlighting based on transcript timestamps
  // For now, just display the text
  const renderResponseText = () => {
    return (
      <div className={styles.responseText}>
        {response.speaker_text}
      </div>
    );
  };

  return (
    <div className={styles.container}>
      {parentQuestion && (
        <QuestionContext questionText={parentQuestion.question_text} />
      )}

      <div className={styles.responseSection}>
        <div className={styles.speakerInfo}>
          <h3 className={styles.speakerName}>{response.speaker_name}</h3>
        </div>

        <ResponsePlayButton
          response={response}
          isPlaying={isPlaying}
          currentTime={audioState.currentTime}
          duration={duration}
          onPlay={handlePlay}
          onPause={handlePause}
          onSeek={handleSeek}
        />

        {renderResponseText()}
      </div>
    </div>
  );
});

SingleView.displayName = 'SingleView';
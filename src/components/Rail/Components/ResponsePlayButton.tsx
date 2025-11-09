/**
 * ResponsePlayButton - Audio player for individual response segments
 * Visual Reference: https://www.figma.com/design/3RRAJtxVKX0kbSZT8ouJWa/Anthology-III?node-id=94-17564&m=dev
 */

import { memo, useRef, useCallback } from 'react';
import type { ResponseNode } from '@types';
import styles from './ResponsePlayButton.module.css';

interface ResponsePlayButtonProps {
  response: ResponseNode;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (time: number) => void;
}

export const ResponsePlayButton = memo<ResponsePlayButtonProps>(({
  // response, // TODO: Will be used in Phase 5 for audio playback
  isPlaying,
  currentTime,
  duration,
  onPlay,
  onPause,
  onSeek
}) => {
  const progressBarRef = useRef<HTMLDivElement>(null);

  const handlePlayPause = () => {
    if (isPlaying) {
      onPause();
    } else {
      onPlay();
    }
  };

  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current) return;

    const rect = progressBarRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    const newTime = percentage * duration;

    onSeek(newTime);
  }, [duration, onSeek]);

  // Calculate progress percentage
  const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Format time display (mm:ss)
  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const timeRemaining = Math.max(0, duration - currentTime);

  return (
    <div className={styles.container}>
      <button
        className={styles.playButton}
        onClick={handlePlayPause}
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? (
          <svg
            className={styles.icon}
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect x="5" y="4" width="4" height="12" fill="currentColor" />
            <rect x="11" y="4" width="4" height="12" fill="currentColor" />
          </svg>
        ) : (
          <svg
            className={styles.icon}
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M6 4L15 10L6 16V4Z" fill="currentColor" />
          </svg>
        )}
      </button>

      <div className={styles.progressContainer}>
        <div
          ref={progressBarRef}
          className={styles.progressBar}
          onClick={handleProgressClick}
          role="slider"
          aria-label="Audio progress"
          aria-valuemin={0}
          aria-valuemax={duration}
          aria-valuenow={currentTime}
        >
          <div
            className={styles.progressFill}
            style={{ width: `${progressPercentage}%` }}
          />
          <div
            className={styles.progressThumb}
            style={{ left: `${progressPercentage}%` }}
          />
        </div>
        <span className={styles.timeRemaining}>
          -{formatTime(timeRemaining)}
        </span>
      </div>
    </div>
  );
});

ResponsePlayButton.displayName = 'ResponsePlayButton';
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
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    if (!buttonRef.current) return;

    const rect = buttonRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    
    // If clicked in first 44px (icon area), toggle play/pause
    if (clickX < 44) {
      if (isPlaying) {
        onPause();
      } else {
        onPlay();
      }
    } else {
      // Otherwise seek to position
      const newTime = percentage * duration;
      onSeek(newTime);
      if (!isPlaying) {
        onPlay();
      }
    }
  }, [duration, onSeek, isPlaying, onPlay, onPause]);

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
        ref={buttonRef}
        className={styles.playButton}
        onClick={handleClick}
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        {/* Progress fill - fills button from left to right */}
        <div
          className={styles.progressFill}
          style={{ width: `${progressPercentage}%` }}
        />
        
        {/* Button content sits above progress fill */}
        <div className={styles.buttonContent}>
          {isPlaying ? (
            <svg
              className={styles.icon}
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <rect x="2" y="2" width="3" height="8" fill="currentColor" />
              <rect x="7" y="2" width="3" height="8" fill="currentColor" />
            </svg>
          ) : (
            <svg
              className={styles.icon}
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M3 1.5L10 6L3 10.5V1.5Z" fill="currentColor" />
            </svg>
          )}
          
          <span className={styles.progressContainer}>
            {isPlaying ? 'Listening' : 'Listen'}
          </span>
          
          <span className={styles.timeRemaining}>
            {formatTime(timeRemaining)}
          </span>
        </div>
      </button>
    </div>
  );
});

ResponsePlayButton.displayName = 'ResponsePlayButton';
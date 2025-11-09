/**
 * MedleyPlayButton - Shuffle playback control for multiple responses
 * Visual Reference: https://www.figma.com/design/3RRAJtxVKX0kbSZT8ouJWa/Anthology-III?node-id=94-17537&m=dev
 */

import { memo } from 'react';
import styles from './MedleyPlayButton.module.css';

interface MedleyPlayButtonProps {
  responseIds: string[];
  isPlaying: boolean;
  currentPlayingId: string | null;
  onPlay: () => void;
  onPause: () => void;
}

export const MedleyPlayButton = memo<MedleyPlayButtonProps>(({
  responseIds,
  isPlaying,
  currentPlayingId,
  onPlay,
  onPause
}) => {
  const handleClick = () => {
    if (isPlaying) {
      onPause();
    } else {
      onPlay();
    }
  };

  const buttonLabel = isPlaying ? 'Pause medley' : 'Play random response';

  return (
    <div className={styles.container}>
      <button
        className={styles.button}
        onClick={handleClick}
        aria-label={buttonLabel}
        title={buttonLabel}
      >
        <div className={styles.iconContainer}>
          {isPlaying ? (
            <svg
              className={styles.icon}
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <rect x="3" y="3" width="4" height="10" fill="currentColor" />
              <rect x="9" y="3" width="4" height="10" fill="currentColor" />
            </svg>
          ) : (
            <svg
              className={styles.icon}
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M4 2L13 8L4 14V2Z" fill="currentColor" />
            </svg>
          )}
        </div>
        <span className={styles.label}>
          {isPlaying ? 'Playing Medley' : 'Play Medley'}
        </span>
        {responseIds.length > 0 && (
          <span className={styles.count}>
            ({responseIds.length} responses)
          </span>
        )}
      </button>

      {isPlaying && currentPlayingId && (
        <div className={styles.nowPlaying}>
          <svg
            className={styles.shuffleIcon}
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M9 1V3H7C5.9 3 5 3.9 5 5V7C5 8.1 4.1 9 3 9H1M9 11V9H7C5.9 9 5 8.1 5 7V5C5 3.9 4.1 3 3 3H1"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <path
              d="M8 0L10 2L8 4M8 8L10 10L8 12"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className={styles.nowPlayingText}>Shuffle mode</span>
        </div>
      )}
    </div>
  );
});

MedleyPlayButton.displayName = 'MedleyPlayButton';
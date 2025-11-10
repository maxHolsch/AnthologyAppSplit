/**
 * MedleyPlayButton - Shuffle playback control for multiple responses
 * Large prominent button design matching Figma specs
 * Visual Reference: https://www.figma.com/design/8rPqQMt3PEL7MhKhWqtSre/Anthology-III--Copy-?node-id=94-17537
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
  isPlaying,
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

  const buttonLabel = isPlaying ? 'Listening' : 'Listen';
  const duration = '0:30'; // TODO: Calculate actual duration from response audio timestamps

  return (
    <button
      className={`${styles.button} ${isPlaying ? styles.playing : ''}`}
      onClick={handleClick}
      aria-label={isPlaying ? 'Pause medley' : 'Play medley'}
      title={isPlaying ? 'Pause medley' : 'Play medley'}
    >
      {/* Play/Pause Icon */}
      <div className={styles.iconContainer}>
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
      </div>

      {/* Label Text */}
      <span className={styles.label}>{buttonLabel}</span>

      {/* Duration */}
      <span className={styles.duration}>{duration}</span>
    </button>
  );
});

MedleyPlayButton.displayName = 'MedleyPlayButton';
/**
 * ResponseTile - Response preview card for the QuestionView
 * Visual Reference: https://www.figma.com/design/8rPqQMt3PEL7MhKhWqtSre/Anthology-III--Copy-?node-id=94-17579
 */

import { memo, useCallback } from 'react';
import type { ResponseNode } from '@types';
import { useAnthologyStore } from '@stores';
import styles from './ResponseTile.module.css';

interface ResponseTileProps {
  response: ResponseNode;
  onClick: (responseId: string) => void;
  onHover: (responseId: string | null) => void;
  showSeparator?: boolean;
}

export const ResponseTile = memo<ResponseTileProps>(({
  response,
  onClick,
  onHover,
  showSeparator = false
}) => {
  const speakerColorAssignments = useAnthologyStore(state => state.data.speakerColorAssignments);
  const colorAssignments = useAnthologyStore(state => state.data.colorAssignments);

  // Get speaker color from speaker assignments, fallback to conversation color
  const speakerColorKey = `${response.conversation_id}:${response.speaker_name}`;
  const speakerColor = speakerColorAssignments.get(speakerColorKey)?.color ||
                        colorAssignments.get(response.conversation_id)?.color ||
                        '#999999';

  const handleClick = useCallback(() => {
    onClick(response.id);
  }, [onClick, response.id]);

  const handleMouseEnter = useCallback(() => {
    onHover(response.id);
  }, [onHover, response.id]);

  const handleMouseLeave = useCallback(() => {
    onHover(null);
  }, [onHover]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick(response.id);
    }
  }, [onClick, response.id]);

  // Format duration from audio timestamps
  const getDuration = () => {
    if (response.audio_start !== undefined && response.audio_end !== undefined) {
      const durationMs = response.audio_end - response.audio_start;
      const seconds = Math.floor(durationMs / 1000);
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
    return '0:30'; // Fallback
  };

  // Truncate text for preview - show more text per Figma
  const previewText = response.speaker_text.length > 200
    ? `"...${response.speaker_text.substring(0, 200)}..."`
    : `"...${response.speaker_text}..."`;

  return (
    <>
      <div
        className={styles.tile}
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-label={`Response by ${response.speaker_name}`}
      >
        {/* Speaker Badge with colored dot */}
        <div className={styles.speakerBadge}>
          <div
            className={styles.colorDot}
            style={{ backgroundColor: speakerColor }}
          />
          <span className={styles.speakerName}>{response.speaker_name}</span>
        </div>

        {/* Play Button with Duration */}
        <div className={styles.playButton}>
          <svg
            className={styles.playIcon}
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M3 1.5L10 6L3 10.5V1.5Z" fill="currentColor" />
          </svg>
          <span className={styles.duration}>{getDuration()}</span>
        </div>

        {/* Preview Text */}
        <p className={styles.previewText}>{previewText}</p>
      </div>

      {/* Separator Line */}
      {showSeparator && <div className={styles.separator} />}
    </>
  );
});

ResponseTile.displayName = 'ResponseTile';
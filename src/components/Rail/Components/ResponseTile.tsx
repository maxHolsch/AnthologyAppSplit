/**
 * ResponseTile - Response preview card for the QuestionView
 * Visual Reference: https://www.figma.com/design/3RRAJtxVKX0kbSZT8ouJWa/Anthology-III?node-id=94-17579&m=dev
 */

import { memo, useCallback } from 'react';
import type { ResponseNode } from '@types';
import { useAnthologyStore } from '@stores';
import styles from './ResponseTile.module.css';

interface ResponseTileProps {
  response: ResponseNode;
  onClick: (responseId: string) => void;
  onHover: (responseId: string | null) => void;
}

export const ResponseTile = memo<ResponseTileProps>(({ response, onClick, onHover }) => {
  const colorAssignments = useAnthologyStore(state => state.data.colorAssignments);
  const conversationColor = colorAssignments.get(response.conversation_id)?.color || '#999999';

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

  // Truncate text for preview (approximately 100 characters)
  const previewText = response.speaker_text.length > 100
    ? response.speaker_text.substring(0, 100) + '...'
    : response.speaker_text;

  return (
    <div
      className={styles.tile}
      style={{ borderLeftColor: conversationColor }}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`Response by ${response.speaker_name}`}
    >
      <div className={styles.content}>
        <div className={styles.speakerName}>{response.speaker_name}</div>
        <p className={styles.previewText}>{previewText}</p>
      </div>
      <div className={styles.playIconContainer}>
        <svg
          className={styles.playIcon}
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M8 6.5L13.5 10L8 13.5V6.5Z"
            fill="currentColor"
          />
        </svg>
      </div>
    </div>
  );
});

ResponseTile.displayName = 'ResponseTile';
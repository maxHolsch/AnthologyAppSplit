/**
 * NarrativeTile - Clickable narrative card for the NarrativesView
 * Similar to QuestionTile but for narratives
 */

import { memo } from 'react';
import styles from './QuestionTile.module.css'; // Reuse same styles

interface NarrativeTileProps {
  narrativeId: string;
  narrativeName: string;
  narrativeColor: string;
  responseCount: number;
  onClick: (narrativeId: string) => void;
  onHover?: (narrativeId: string | null) => void;
}

export const NarrativeTile = memo<NarrativeTileProps>(({
  narrativeId,
  narrativeName,
  narrativeColor,
  responseCount,
  onClick,
  onHover
}) => {
  const handleClick = () => {
    onClick(narrativeId);
  };

  const handleMouseEnter = () => {
    onHover?.(narrativeId);
  };

  const handleMouseLeave = () => {
    onHover?.(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick(narrativeId);
    }
  };

  return (
    <div
      className={styles.tile}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`View narrative: ${narrativeName}`}
    >
      <p className={styles.questionText}>{narrativeName}</p>
      <div className={styles.responseCount}>
        <svg
          width="8"
          height="8"
          viewBox="0 0 8 8"
          fill="none"
          className={styles.dotIcon}
        >
          <circle cx="4" cy="4" r="4" fill={narrativeColor} fillOpacity={1.0} />
        </svg>
        <span>{responseCount} {responseCount === 1 ? 'EXCERPT' : 'EXCERPTS'}</span>
      </div>
    </div>
  );
});

NarrativeTile.displayName = 'NarrativeTile';

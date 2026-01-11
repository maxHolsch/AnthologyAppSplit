/**
 * NarrativeTile - Clickable narrative card for the NarrativesView
 * Similar to QuestionTile but for narratives
 */

import { memo } from 'react';
import DotIcon from '../../../assets/dot.svg';
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
      style={{ borderLeft: `4px solid ${narrativeColor}` }}
    >
      <p className={styles.questionText}>{narrativeName}</p>
      <div className={styles.responseCount}>
        <img src={DotIcon} alt="" className={styles.dotIcon} />
        <span>{responseCount} {responseCount === 1 ? 'EXCERPT' : 'EXCERPTS'}</span>
      </div>
    </div>
  );
});

NarrativeTile.displayName = 'NarrativeTile';

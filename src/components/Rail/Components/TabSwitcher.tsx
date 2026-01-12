/**
 * TabSwitcher - Tabs for switching between QUESTIONS and NARRATIVES views
 */

import { memo } from 'react';
import { useAnthologyStore } from '@stores';
import styles from './TabSwitcher.module.css';

export const TabSwitcher = memo(() => {
  const railMode = useAnthologyStore(state => state.view.railMode);
  const setRailMode = useAnthologyStore(state => state.setRailMode);
  const clearSelection = useAnthologyStore(state => state.clearSelection);
  const zoomToFullMap = useAnthologyStore(state => state.zoomToFullMap);

  const isQuestionsActive = railMode === 'conversations' || railMode === 'question';
  const isNarrativesActive = railMode === 'narratives' || railMode === 'narrative';

  const handleQuestionsClick = () => {
    clearSelection(); // Clear any active selection
    zoomToFullMap(); // Reset zoom to full map view
    setRailMode('conversations');
  };

  const handleNarrativesClick = () => {
    clearSelection(); // Clear any active selection
    zoomToFullMap(); // Reset zoom to full map view
    setRailMode('narratives');
  };

  return (
    <div className={styles.tabSwitcher}>
      <button
        className={`${styles.tab} ${isQuestionsActive ? styles.active : ''}`}
        onClick={handleQuestionsClick}
        aria-label="View questions"
      >
        QUESTIONS
      </button>
      <span className={styles.separator}>|</span>
      <button
        className={`${styles.tab} ${isNarrativesActive ? styles.active : ''}`}
        onClick={handleNarrativesClick}
        aria-label="View narratives"
      >
        NARRATIVES
      </button>
    </div>
  );
});

TabSwitcher.displayName = 'TabSwitcher';

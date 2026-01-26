/**
 * TabSwitcher - Tabs for switching between QUESTIONS and NARRATIVES views
 */

import { memo } from 'react';
import { useAnthologyStore } from '@stores';
import styles from './TabSwitcher.module.css';

export const TabSwitcher = memo(() => {
  const railMode = useAnthologyStore(state => state.view.railMode);
  const mapViewMode = useAnthologyStore(state => state.view.mapViewMode);
  const setRailMode = useAnthologyStore(state => state.setRailMode);
  const setMapViewMode = useAnthologyStore(state => state.setMapViewMode);
  const clearSelection = useAnthologyStore(state => state.clearSelection);
  const zoomToFullMap = useAnthologyStore(state => state.zoomToFullMap);

  const isQuestionsActive = railMode === 'conversations' || railMode === 'question';
  const isNarrativesActive = railMode === 'narratives' || railMode === 'narrative';

  const handleQuestionsClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent event bubbling
    zoomToFullMap(); // Reset zoom to full map view
    // Sync map view mode first (this will call clearSelection internally)
    if (mapViewMode !== 'question') {
      setMapViewMode('question');
    }
    // Set rail mode AFTER map view mode to ensure it's not overridden
    setRailMode('conversations');
  };

  const handleNarrativesClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent event bubbling
    zoomToFullMap(); // Reset zoom to full map view
    // Sync map view mode first (this will call clearSelection internally)
    if (mapViewMode !== 'narrative') {
      setMapViewMode('narrative');
    }
    // Set rail mode AFTER map view mode to ensure it's not overridden
    setRailMode('narratives');
  };

  return (
    <div className={styles.tabSwitcher}>
      <button
        type="button"
        className={`${styles.tab} ${isQuestionsActive ? styles.active : ''}`}
        onClick={handleQuestionsClick}
        aria-label="View questions"
      >
        QUESTIONS
      </button>
      <span className={styles.separator}>|</span>
      <button
        type="button"
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

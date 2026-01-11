/**
 * NarrativesView - View showing all narratives as entry points
 * Similar to ConversationsView but for narratives
 */

import { memo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useAnthologyStore } from '@stores';
import { NarrativeTile } from '../Components/NarrativeTile';
import { TabSwitcher } from '../Components/TabSwitcher';
import AnthologyIcon from '../../../assets/icon.svg';
import styles from './ConversationsView.module.css'; // Reuse same styles

export const NarrativesView = memo(() => {
  const { slug } = useParams();
  const getNarrativesWithResponses = useAnthologyStore(state => state.getNarrativesWithResponses);
  const setActiveNarrative = useAnthologyStore(state => state.setActiveNarrative);
  const hoverNodes = useAnthologyStore(state => state.hoverNodes);

  const handleNarrativeClick = useCallback((narrativeId: string) => {
    // Navigate to narrative view mode showing all responses for this narrative
    setActiveNarrative(narrativeId);
  }, [setActiveNarrative]);

  const handleNarrativeHover = useCallback((narrativeId: string | null) => {
    if (narrativeId) {
      // Get all response IDs for this narrative
      const narratives = getNarrativesWithResponses();
      const narrative = narratives.find(n => n.id === narrativeId);
      if (narrative) {
        const responseIds = narrative.responses.map(r => r.id);
        hoverNodes(responseIds);
      }
    } else {
      // Clear hover
      hoverNodes([]);
    }
  }, [getNarrativesWithResponses, hoverNodes]);

  const narratives = getNarrativesWithResponses();

  if (narratives.length === 0) {
    return (
      <div className={styles.emptyState}>
        <p>No narratives available</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <img src={AnthologyIcon} alt="Anthology" className={styles.logo} />
      <h1 className={styles.mainTitle}>
        highlights from {slug ?? 'this'} conversation
      </h1>
      <TabSwitcher />
      <div className={styles.questionList}>
        {narratives.map(narrative => (
          <NarrativeTile
            key={narrative.id}
            narrativeId={narrative.id}
            narrativeName={narrative.name}
            narrativeColor={narrative.color}
            responseCount={narrative.responses.length}
            onClick={handleNarrativeClick}
            onHover={handleNarrativeHover}
          />
        ))}
      </div>
    </div>
  );
});

NarrativesView.displayName = 'NarrativesView';

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
  const narrativeNodes = useAnthologyStore(state => state.data.narrativeNodes);
  const narrativeColorAssignments = useAnthologyStore(state => state.data.narrativeColorAssignments);
  const getResponsesForNarrative = useAnthologyStore(state => state.getResponsesForNarrative);
  const setActiveNarrative = useAnthologyStore(state => state.setActiveNarrative);
  const hoverNodes = useAnthologyStore(state => state.hoverNodes);

  const handleNarrativeClick = useCallback((narrativeId: string) => {
    // Navigate to narrative view mode showing all responses for this narrative
    setActiveNarrative(narrativeId);
  }, [setActiveNarrative]);

  const handleNarrativeHover = useCallback((narrativeId: string | null) => {
    if (narrativeId) {
      // Get all response IDs for this narrative
      const responses = getResponsesForNarrative(narrativeId);
      const responseIds = responses.map(r => r.id);
      hoverNodes(responseIds);
    } else {
      // Clear hover
      hoverNodes([]);
    }
  }, [getResponsesForNarrative, hoverNodes]);

  // Build narratives list from all narrative nodes
  // Filter out "Misc" narrative if it has 0 responses
  const narratives = Array.from(narrativeNodes.values())
    .map(narrative => {
      const responses = getResponsesForNarrative(narrative.id);
      const color = narrativeColorAssignments.get(narrative.id) || '#999999';
      // Use narrative_text directly from the database
      const name = narrative.narrative_text || narrative.id;

      return {
        id: narrative.id,
        name,
        color,
        responses,
      };
    })
    .filter(narrative => {
      // Hide "Misc" narrative if it has 0 responses
      if (narrative.name === 'Misc' && narrative.responses.length === 0) {
        return false;
      }
      return true;
    });

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
      <p className={styles.sectionHeader}>NARRATIVES</p>
      <div className={styles.questionList}>
        {narratives.map(narrative => (
          <NarrativeTile
            key={narrative.id}
            narrativeId={narrative.id}
            narrativeName={narrative.name}
            narrativeColor={narrative.color}
            responseCount={narrative.responses.length}
            onClick={handleNarrativeClick}
          />
        ))}
      </div>
    </div>
  );
});

NarrativesView.displayName = 'NarrativesView';

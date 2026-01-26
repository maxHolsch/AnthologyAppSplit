/**
 * NarrativesView - View showing all narratives as entry points
 * Similar to ConversationsView but for narratives
 */

import { memo, useCallback } from 'react';
import { useAnthologyStore } from '@stores';
import { NarrativeTile } from '../Components/NarrativeTile';
import { TabSwitcher } from '../Components/TabSwitcher';
import AnthologyIcon from '../../../assets/icon.svg';
import styles from './ConversationsView.module.css'; // Reuse same styles

export const NarrativesView = memo(() => {
  const narrativeNodes = useAnthologyStore(state => state.data.narrativeNodes);
  const responseNodes = useAnthologyStore(state => state.data.responseNodes);
  const narrativeColorAssignments = useAnthologyStore(state => state.data.narrativeColorAssignments);
  const getResponsesForNarrative = useAnthologyStore(state => state.getResponsesForNarrative);
  const selectNarrative = useAnthologyStore(state => state.selectNarrative);
  const hoverNodes = useAnthologyStore(state => state.hoverNodes);
  const edges = useAnthologyStore(state => state.data.edges);
  const nodesMap = useAnthologyStore(state => state.data.nodes);

  const handleNarrativeClick = useCallback((narrativeId: string) => {
    // Navigate to narrative view mode showing all responses for this narrative with zoom
    selectNarrative(narrativeId);
  }, [selectNarrative]);

  const handleNarrativeHover = useCallback((narrativeId: string | null) => {
    if (narrativeId) {
      // Get all response IDs for this narrative
      const responses = getResponsesForNarrative(narrativeId);
      const narrativeResponseIds = responses.map(r => r.id);

      // Find all questions connected to these responses (same logic as NarrativeLabelNode)
      const connectedQuestionIds = new Set<string>();
      edges.forEach(edge => {
        const sourceId = typeof edge.source === 'string' ? edge.source : edge.source?.id;
        const targetId = typeof edge.target === 'string' ? edge.target : edge.target?.id;

        // Check if response is source or target
        if (narrativeResponseIds.includes(sourceId)) {
          // Source is a narrative response, target might be a question
          const targetNode = responseNodes.get(targetId);
          if (!targetNode) {
            // It's a question node
            connectedQuestionIds.add(targetId);
          }
        } else if (narrativeResponseIds.includes(targetId)) {
          // Target is a narrative response, source might be a question
          const sourceNode = responseNodes.get(sourceId);
          if (!sourceNode) {
            // It's a question node
            connectedQuestionIds.add(sourceId);
          }
        }
      });

      // Find the narrative label node for this narrative (if it exists)
      const narrativeLabelNodeId = Array.from(nodesMap.values()).find(
        node => node.type === 'narrative_label' && (node.data as any).narrative_id === narrativeId
      )?.id;

      // Combine response, question IDs, and narrative label node ID
      const allNodeIds = [
        ...narrativeResponseIds,
        ...Array.from(connectedQuestionIds),
        ...(narrativeLabelNodeId ? [narrativeLabelNodeId] : [])
      ];
      hoverNodes(allNodeIds);
    } else {
      // Clear hover
      hoverNodes([]);
    }
  }, [getResponsesForNarrative, hoverNodes, edges, responseNodes, nodesMap]);

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

  // Count total responses
  const totalResponses = responseNodes.size;

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
        What role should AI play in the future of work?
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

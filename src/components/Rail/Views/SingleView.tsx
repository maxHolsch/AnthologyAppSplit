/**
 * SingleView - Full display of a single response with audio playback
 * Visual Reference: https://www.figma.com/design/3RRAJtxVKX0kbSZT8ouJWa/Anthology-III?node-id=207-1114&m=dev
 */

import { memo, useMemo, useState } from 'react';
import { useAnthologyStore } from '@stores';
import { useVisualizationStore } from '@stores';
import { BackButton } from '../Components/BackButton';
import { SpeakerHeader } from '../Components/SpeakerHeader';
import { QuestionContext } from '../Components/QuestionContext';
import { RespondModal } from '../Components/RespondModal';
import { AudioPlayer } from '@components/Audio/AudioPlayer';
import { HighlightedText } from '@components/Audio/HighlightedText';
import styles from './SingleView.module.css';

export interface SingleViewProps {
  anthologySlug?: string;
}

export const SingleView = memo<SingleViewProps>(({ anthologySlug }) => {
  const activeResponse = useAnthologyStore(state => state.view.activeResponse);
  const previousRailMode = useAnthologyStore(state => state.view.previousRailMode);
  const responseNodes = useAnthologyStore(state => state.data.responseNodes);
  const questionNodes = useAnthologyStore(state => state.data.questionNodes);
  const narrativeNodes = useAnthologyStore(state => state.data.narrativeNodes);
  const narrativeColorAssignments = useAnthologyStore(state => state.data.narrativeColorAssignments);
  const speakerColorAssignments = useAnthologyStore(state => state.data.speakerColorAssignments);
  const colorAssignments = useAnthologyStore(state => state.data.colorAssignments);
  const setRailMode = useAnthologyStore(state => state.setRailMode);
  const setActiveQuestion = useAnthologyStore(state => state.setActiveQuestion);
  const setActiveNarrative = useAnthologyStore(state => state.setActiveNarrative);
  const setActiveResponse = useAnthologyStore(state => state.setActiveResponse);
  const zoomToFullMap = useAnthologyStore(state => state.zoomToFullMap);

  // Get the response data
  const response = activeResponse ? responseNodes.get(activeResponse) : null;

  const [respondOpen, setRespondOpen] = useState(false);

  // Get the parent question
  const parentQuestion = useMemo(() => {
    if (!response?.responds_to) return null;
    return questionNodes.get(response.responds_to);
  }, [response, questionNodes]);

  // Get the parent narrative
  const parentNarrative = useMemo(() => {
    if (!response?.responds_to_narrative_id) return null;
    return narrativeNodes.get(response.responds_to_narrative_id);
  }, [response, narrativeNodes]);

  // Resolve color with proper hierarchy - matches D3 ResponseNode logic
  const speakerColor = useMemo(() => {
    if (!response) return '#999999'; // Grey fallback

    // Get narrative color if response belongs to a narrative (matches D3 node logic)
    const narrativeId = response.responds_to_narrative_id;
    const narrativeColor = narrativeId
      ? narrativeColorAssignments.get(narrativeId)
      : null;

    // Get speaker/conversation color as fallback
    const speakerColorKey = `${response.conversation_id}:${response.speaker_name}`;
    const speakerColorScheme = speakerColorAssignments.get(speakerColorKey)?.color ||
                                colorAssignments.get(response.conversation_id)?.color ||
                                '#999999';

    // Priority: narrative color || speaker/conversation color || grey fallback
    // This matches the exact logic in ResponseNode.tsx and ResponseTile.tsx
    const colorScheme = narrativeColor || speakerColorScheme;

    // Handle SpeakerColorScheme objects (extract circle property for avatar)
    if (typeof colorScheme === 'string') {
      return colorScheme;
    }
    // For SpeakerColorScheme objects, use the circle color
    return colorScheme.circle;
  }, [response, narrativeColorAssignments, speakerColorAssignments, colorAssignments]);

  const handleBack = () => {
    console.log('[SingleView.handleBack] previousRailMode:', previousRailMode);

    const vizStore = useVisualizationStore.getState();
    const centerOnNode = vizStore.centerOnNode;

    // Navigate based on where we came from (previousRailMode)
    if (previousRailMode === 'narrative' && parentNarrative) {
      // Came from narrative view - go back to that narrative
      const narrativeLabelNodeId = `narrative_label_${parentNarrative.id}`;
      const position = vizStore.getNodePosition(narrativeLabelNodeId);

      if (position && centerOnNode) {
        centerOnNode(position.x, position.y, 1.5, 750);
      }

      setActiveNarrative(parentNarrative.id);
      setActiveResponse(null);
      setRailMode('narrative');
    } else if (previousRailMode === 'question' && parentQuestion) {
      // Came from question view - go back to that question
      const position = vizStore.getNodePosition(parentQuestion.id);

      if (position && centerOnNode) {
        centerOnNode(position.x, position.y, 1.5, 750);
      }

      setActiveQuestion(parentQuestion.id);
      setActiveResponse(null);
      setRailMode('question');
    } else {
      // Fallback: try to determine from response data
      if (parentQuestion) {
        const position = vizStore.getNodePosition(parentQuestion.id);
        if (position && centerOnNode) {
          centerOnNode(position.x, position.y, 1.5, 750);
        }
        setActiveQuestion(parentQuestion.id);
        setActiveResponse(null);
        setRailMode('question');
      } else if (parentNarrative) {
        const narrativeLabelNodeId = `narrative_label_${parentNarrative.id}`;
        const position = vizStore.getNodePosition(narrativeLabelNodeId);
        if (position && centerOnNode) {
          centerOnNode(position.x, position.y, 1.5, 750);
        }
        setActiveNarrative(parentNarrative.id);
        setActiveResponse(null);
        setRailMode('narrative');
      } else {
        // No parent found - go back to conversations
        zoomToFullMap();
        setRailMode('conversations');
      }
    }
  };

  if (!response) {
    return (
      <div className={styles.emptyState}>
        <p>No response selected</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <BackButton onClick={handleBack} />

      <div className={styles.content}>
        <SpeakerHeader
          speakerName={response.speaker_name}
          color={speakerColor}
          response={response}
        />

        <button
          className={styles.respondButton}
          onClick={() => setRespondOpen(true)}
          type="button"
        >
          Respond to {response.speaker_name}
        </button>

        <RespondModal
          open={respondOpen}
          targetResponse={response}
          onClose={() => setRespondOpen(false)}
          anthologySlug={anthologySlug}
        />

        {parentQuestion && (
          <QuestionContext questionText={parentQuestion.question_text} />
        )}

        <div className={styles.audioSection}>
          <AudioPlayer response={response} />
        </div>

        <div className={styles.responseText}>
          <HighlightedText response={response} />
        </div>
      </div>
    </div>
  );
});

SingleView.displayName = 'SingleView';

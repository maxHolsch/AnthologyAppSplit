/**
 * RailHeader - Navigation header for the comment rail
 * Shows context-appropriate title and back button
 */

import { memo, useCallback } from 'react';
import { useAnthologyStore } from '@stores';
import { BackButton } from './Components/BackButton';
import styles from './RailHeader.module.css';

export const RailHeader = memo(() => {
  const railMode = useAnthologyStore(state => state.view.railMode);
  const previousRailMode = useAnthologyStore(state => state.view.previousRailMode);
  const activeQuestion = useAnthologyStore(state => state.view.activeQuestion);
  const activeNarrative = useAnthologyStore(state => state.view.activeNarrative);
  const activeResponse = useAnthologyStore(state => state.view.activeResponse);
  const questionNodes = useAnthologyStore(state => state.data.questionNodes);
  const narrativeNodes = useAnthologyStore(state => state.data.narrativeNodes);
  const responseNodes = useAnthologyStore(state => state.data.responseNodes);

  const setRailMode = useAnthologyStore(state => state.setRailMode);
  const setActiveQuestion = useAnthologyStore(state => state.setActiveQuestion);
  const setActiveNarrative = useAnthologyStore(state => state.setActiveNarrative);
  const setActiveResponse = useAnthologyStore(state => state.setActiveResponse);
  const clearSelection = useAnthologyStore(state => state.clearSelection);

  // Handle back navigation
  const handleBack = useCallback(() => {
    switch (railMode) {
      case 'question':
        // Go back to conversations view
        clearSelection();
        break;
      case 'narrative':
        // Go back to narratives view
        clearSelection();
        setRailMode('narratives');
        break;
      case 'single':
        // Go back to where we came from (tracked in previousRailMode)
        const response = responseNodes.get(activeResponse || '');
        console.log('[RailHeader.handleBack] previousRailMode:', previousRailMode, 'response:', response);

        if (previousRailMode === 'narrative') {
          // Came from narrative view - go back to that narrative
          if (response?.responds_to_narrative_id) {
            setActiveNarrative(response.responds_to_narrative_id);
            setActiveResponse(null);
            setRailMode('narrative');
          } else {
            // Fallback to narratives list if no narrative ID
            clearSelection();
            setRailMode('narratives');
          }
        } else if (previousRailMode === 'question') {
          // Came from question view - go back to that question
          if (response?.responds_to) {
            setActiveQuestion(response.responds_to);
            setActiveResponse(null);
            setRailMode('question');
          } else {
            // Fallback to conversations list if no question ID
            clearSelection();
          }
        } else {
          // Fallback: try to determine from response data
          if (response?.responds_to) {
            setActiveQuestion(response.responds_to);
            setActiveResponse(null);
            setRailMode('question');
          } else if (response?.responds_to_narrative_id) {
            setActiveNarrative(response.responds_to_narrative_id);
            setActiveResponse(null);
            setRailMode('narrative');
          } else {
            clearSelection();
          }
        }
        break;
      default:
        break;
    }
  }, [railMode, previousRailMode, activeResponse, responseNodes, setActiveQuestion, setActiveNarrative, setActiveResponse, setRailMode, clearSelection]);

  // Get title based on current mode
  const getTitle = () => {
    switch (railMode) {
      case 'conversations':
        return 'Conversations';
      case 'narratives':
        return 'Narratives';
      case 'question':
        const question = questionNodes.get(activeQuestion || '');
        return question?.question_text || 'Question';
      case 'narrative':
        const narrative = narrativeNodes.get(activeNarrative || '');
        return narrative?.narrative_text || 'Narrative';
      case 'single':
        const response = responseNodes.get(activeResponse || '');
        if (response) {
          return `Response by ${response.speaker_name}`;
        }
        return 'Response';
      default:
        return '';
    }
  };

  const showBackButton = railMode !== 'conversations' && railMode !== 'narratives';

  return (
    <div className={styles.header}>
      {showBackButton && (
        <BackButton
          onClick={handleBack}
          label={
            railMode === 'single'
              ? 'Back to Question or Narrative'
              : railMode === 'narrative'
              ? 'Back to Narratives'
              : 'Back to Conversations'
          }
        />
      )}
      <h2 className={styles.title}>
        {getTitle()}
      </h2>
    </div>
  );
});

RailHeader.displayName = 'RailHeader';
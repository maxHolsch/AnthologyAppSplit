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
  const activeQuestion = useAnthologyStore(state => state.view.activeQuestion);
  const activeResponse = useAnthologyStore(state => state.view.activeResponse);
  const questionNodes = useAnthologyStore(state => state.data.questionNodes);
  const responseNodes = useAnthologyStore(state => state.data.responseNodes);

  const setRailMode = useAnthologyStore(state => state.setRailMode);
  const setActiveQuestion = useAnthologyStore(state => state.setActiveQuestion);
  const setActiveResponse = useAnthologyStore(state => state.setActiveResponse);
  const clearSelection = useAnthologyStore(state => state.clearSelection);

  // Handle back navigation
  const handleBack = useCallback(() => {
    switch (railMode) {
      case 'question':
        // Go back to conversations view
        clearSelection();
        break;
      case 'single':
        // Go back to question view
        const response = responseNodes.get(activeResponse || '');
        if (response?.responds_to) {
          // If response is to a question, go back to that question view
          setActiveQuestion(response.responds_to);
          setActiveResponse(null);
          setRailMode('question');
        } else {
          // Otherwise go back to conversations
          clearSelection();
        }
        break;
      default:
        break;
    }
  }, [railMode, activeResponse, responseNodes, setActiveQuestion, setActiveResponse, setRailMode, clearSelection]);

  // Get title based on current mode
  const getTitle = () => {
    switch (railMode) {
      case 'conversations':
        return 'Conversations';
      case 'question':
        const question = questionNodes.get(activeQuestion || '');
        return question?.question_text || 'Question';
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

  const showBackButton = railMode !== 'conversations';

  return (
    <div className={styles.header}>
      {showBackButton && (
        <BackButton
          onClick={handleBack}
          label={railMode === 'single' ? 'Back to Question' : 'Back to Conversations'}
        />
      )}
      <h2 className={styles.title}>
        {getTitle()}
      </h2>
    </div>
  );
});

RailHeader.displayName = 'RailHeader';
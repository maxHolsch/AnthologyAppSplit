/**
 * ConversationsView - Initial view showing all questions as entry points
 */

import { memo, useCallback } from 'react';
import { useAnthologyStore } from '@stores';
import { QuestionTile } from '../Components/QuestionTile';
import { TabSwitcher } from '../Components/TabSwitcher';
import AnthologyIcon from '../../../assets/icon.svg';
import styles from './ConversationsView.module.css';

export const ConversationsView = memo(() => {
  const questionNodes = useAnthologyStore(state => state.data.questionNodes);
  const responseNodes = useAnthologyStore(state => state.data.responseNodes);
  const selectQuestion = useAnthologyStore(state => state.selectQuestion);

  const handleQuestionClick = useCallback((questionId: string) => {
    selectQuestion(questionId);
    // TODO: Add zoom to question on map
  }, [selectQuestion]);

  // Convert Map to array for rendering
  const questions = Array.from(questionNodes.values());

  if (questions.length === 0) {
    return (
      <div className={styles.emptyState}>
        <p>No conversations available</p>
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
        {questions.map(question => (
          <QuestionTile
            key={question.id}
            question={question}
            onClick={handleQuestionClick}
          />
        ))}
      </div>
    </div>
  );
});

ConversationsView.displayName = 'ConversationsView';

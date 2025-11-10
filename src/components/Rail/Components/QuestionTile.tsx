/**
 * QuestionTile - Clickable question card for the ConversationsView
 * Visual Reference: https://www.figma.com/design/3RRAJtxVKX0kbSZT8ouJWa/Anthology-III?node-id=94-17536&m=dev
 */

import { memo } from 'react';
import type { QuestionNode } from '@types';
import DotIcon from '../../../assets/dot.svg';
import styles from './QuestionTile.module.css';

interface QuestionTileProps {
  question: QuestionNode;
  onClick: (questionId: string) => void;
}

export const QuestionTile = memo<QuestionTileProps>(({ question, onClick }) => {
  const handleClick = () => {
    onClick(question.id);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick(question.id);
    }
  };

  return (
    <div
      className={styles.tile}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`View question: ${question.question_text}`}
    >
      <p className={styles.questionText}>{question.question_text}</p>
      {question.related_responses && (
        <div className={styles.responseCount}>
          <img src={DotIcon} alt="" className={styles.dotIcon} />
          <span>{question.related_responses.length} {question.related_responses.length === 1 ? 'EXCERPT' : 'EXCERPTS'}</span>
        </div>
      )}
    </div>
  );
});

QuestionTile.displayName = 'QuestionTile';
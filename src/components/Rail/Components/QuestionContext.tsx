/**
 * QuestionContext - Shows which question a response is addressing
 * Visual Reference: https://www.figma.com/design/3RRAJtxVKX0kbSZT8ouJWa/Anthology-III?node-id=94-17597&m=dev
 */

import { memo } from 'react';
import styles from './QuestionContext.module.css';

interface QuestionContextProps {
  questionText: string;
}

export const QuestionContext = memo<QuestionContextProps>(({ questionText }) => {
  return (
    <div className={styles.context}>
      <span className={styles.label}>In response to:</span>
      <p className={styles.questionText}>{questionText}</p>
    </div>
  );
});

QuestionContext.displayName = 'QuestionContext';
/**
 * QuestionContext - Shows which question a response is addressing
 * Visual Reference: https://www.figma.com/design/3RRAJtxVKX0kbSZT8ouJWa/Anthology-III?node-id=211-362&m=dev
 */

import { memo } from 'react';
import styles from './QuestionContext.module.css';

interface QuestionContextProps {
  questionText: string;
}

export const QuestionContext = memo<QuestionContextProps>(({ questionText }) => {
  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <p className={styles.label}>Question</p>
        <p className={styles.questionText}>{questionText}</p>
      </div>
    </div>
  );
});

QuestionContext.displayName = 'QuestionContext';
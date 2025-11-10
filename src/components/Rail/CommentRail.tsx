/**
 * CommentRail - Main container component for the comment rail sidebar
 * Manages view routing and rail state
 */

import { memo } from 'react';
import { useAnthologyStore } from '@stores';
import { ConversationsView } from './Views/ConversationsView';
import { QuestionView } from './Views/QuestionView';
import { SingleView } from './Views/SingleView';
import { ResizeHandle } from './ResizeHandle';
import styles from './CommentRail.module.css';

export const CommentRail = memo(() => {
  // Get rail state from store
  const railExpanded = useAnthologyStore(state => state.view.railExpanded);
  const railWidth = useAnthologyStore(state => state.view.railWidth);
  const railMode = useAnthologyStore(state => state.view.railMode);

  // Don't render if rail is collapsed
  if (!railExpanded) {
    return null;
  }

  // Render appropriate view based on mode
  const renderView = () => {
    switch (railMode) {
      case 'conversations':
        return <ConversationsView />;
      case 'question':
        return <QuestionView />;
      case 'single':
        return <SingleView />;
      default:
        return <ConversationsView />;
    }
  };

  return (
    <div
      className={styles.rail}
      style={{ width: `${railWidth}px` }}
    >
      <ResizeHandle />
      <div className={styles.content}>
        <div className={styles.viewContainer}>
          {renderView()}
        </div>
      </div>
    </div>
  );
});

CommentRail.displayName = 'CommentRail';
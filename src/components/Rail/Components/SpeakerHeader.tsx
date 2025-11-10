/**
 * SpeakerHeader - Shows speaker avatar/color indicator and name
 * Visual Reference: https://www.figma.com/design/3RRAJtxVKX0kbSZT8ouJWa/Anthology-III?node-id=207-1100&m=dev
 */

import { memo } from 'react';
import styles from './SpeakerHeader.module.css';

interface SpeakerHeaderProps {
  speakerName: string;
  color?: string;
}

export const SpeakerHeader = memo<SpeakerHeaderProps>(({ speakerName, color }) => {
  return (
    <div className={styles.container}>
      <div 
        className={styles.avatar} 
        style={{ backgroundColor: color || '#FF6B35' }}
        aria-hidden="true"
      />
      <h2 className={styles.speakerName}>{speakerName}</h2>
    </div>
  );
});

SpeakerHeader.displayName = 'SpeakerHeader';

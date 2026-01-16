/**
 * SpeakerHeader - Shows speaker avatar/color indicator and name
 * Visual Reference: https://www.figma.com/design/3RRAJtxVKX0kbSZT8ouJWa/Anthology-III?node-id=207-1100&m=dev
 */

import { memo } from 'react';
import type { ResponseNode } from '@types';
import { SyncIcon, AsyncAudioIcon, AsyncTextIcon } from '@components/Icons/NodeIcons';
import styles from './SpeakerHeader.module.css';

interface SpeakerHeaderProps {
  speakerName: string;
  color?: string;
  response?: ResponseNode; // Optional: for rendering correct icon shape
}

export const SpeakerHeader = memo<SpeakerHeaderProps>(({ speakerName, color, response }) => {
  const iconColor = color || '#FF6B35';

  // Determine which icon to use based on synchronicity and medium (matches D3 node logic)
  const isSyncOrLegacy = !response?.synchronicity || response?.synchronicity === 'sync';
  const isAsync = response?.synchronicity === 'asynchronous';
  const isTextMedium = response?.medium === 'text';

  const renderIcon = () => {
    if (isSyncOrLegacy) {
      return <SyncIcon color={iconColor} size={20} />;
    }
    if (isAsync && !isTextMedium) {
      return <AsyncAudioIcon color={iconColor} size={20} />;
    }
    if (isAsync && isTextMedium) {
      return <AsyncTextIcon color={iconColor} size={20} />;
    }
    // Fallback to sync icon
    return <SyncIcon color={iconColor} size={20} />;
  };

  return (
    <div className={styles.container}>
      <div className={styles.avatar} aria-hidden="true">
        {renderIcon()}
      </div>
      <h2 className={styles.speakerName}>{speakerName}</h2>
    </div>
  );
});

SpeakerHeader.displayName = 'SpeakerHeader';

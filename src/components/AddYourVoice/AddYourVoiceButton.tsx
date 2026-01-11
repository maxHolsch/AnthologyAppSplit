import { memo, useState } from 'react';
import { AddYourVoiceModal } from './AddYourVoiceModal';
import styles from './AddYourVoiceButton.module.css';

export interface AddYourVoiceButtonProps {
  anthologySlug?: string;
}

export const AddYourVoiceButton = memo<AddYourVoiceButtonProps>(({ anthologySlug }) => {
  console.log('[AddYourVoiceButton] rendered with slug:', anthologySlug);
  const [open, setOpen] = useState(false);

  return (
    <div className={styles.container}>
      <button className={styles.button} onClick={() => setOpen(true)}>
        add your voice
      </button>
      <AddYourVoiceModal open={open} onClose={() => setOpen(false)} anthologySlug={anthologySlug} />
    </div>
  );
});

AddYourVoiceButton.displayName = 'AddYourVoiceButton';


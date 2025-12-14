import { memo, useState } from 'react';
import { AddYourVoiceModal } from './AddYourVoiceModal';
import styles from './AddYourVoiceButton.module.css';

export const AddYourVoiceButton = memo(() => {
  const [open, setOpen] = useState(false);

  return (
    <div className={styles.container}>
      <button className={styles.button} onClick={() => setOpen(true)}>
        add your vioce
      </button>
      <AddYourVoiceModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
});

AddYourVoiceButton.displayName = 'AddYourVoiceButton';


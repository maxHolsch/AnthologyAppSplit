/**
 * BackButton - Navigation button to go back to the previous view
 * Visual Reference: https://www.figma.com/design/3RRAJtxVKX0kbSZT8ouJWa/Anthology-III?node-id=94-17556&m=dev
 */

import { memo } from 'react';
import styles from './BackButton.module.css';

interface BackButtonProps {
  onClick: () => void;
  label?: string;
}

export const BackButton = memo<BackButtonProps>(({ onClick, label }) => {
  return (
    <button
      className={styles.backButton}
      onClick={onClick}
      aria-label={label || 'Go back'}
    >
      <svg
        className={styles.icon}
        viewBox="0 0 20 20"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M12 16L6 10L12 4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {label && <span className={styles.label}>{label}</span>}
    </button>
  );
});

BackButton.displayName = 'BackButton';
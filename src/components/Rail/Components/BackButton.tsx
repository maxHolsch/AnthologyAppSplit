/**
 * BackButton - Navigation button to go back to the previous view
 * Visual Reference: https://www.figma.com/design/3RRAJtxVKX0kbSZT8ouJWa/Anthology-III?node-id=94-17555&m=dev
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
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M10.5 12L6.5 8L10.5 4"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {label && <span className={styles.label}>{label}</span>}
    </button>
  );
});

BackButton.displayName = 'BackButton';
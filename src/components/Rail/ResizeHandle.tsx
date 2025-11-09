/**
 * ResizeHandle - Draggable handle for resizing the comment rail width
 */

import { memo, useRef, useEffect, useCallback } from 'react';
import { useAnthologyStore } from '@stores';
import styles from './ResizeHandle.module.css';

export const ResizeHandle = memo(() => {
  const railWidth = useAnthologyStore(state => state.view.railWidth);
  const setRailWidth = useAnthologyStore(state => state.setRailWidth);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    startX.current = e.clientX;
    startWidth.current = railWidth;

    // Add body class to prevent text selection while dragging
    document.body.classList.add('resizing');
    document.body.style.cursor = 'ew-resize';
  }, [railWidth]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current) return;

    // Calculate new width (inverted because rail is on the right)
    const deltaX = startX.current - e.clientX;
    const newWidth = startWidth.current + deltaX;

    // Update the rail width (store handles constraints)
    setRailWidth(newWidth);
  }, [setRailWidth]);

  const handleMouseUp = useCallback(() => {
    if (!isDragging.current) return;

    isDragging.current = false;
    document.body.classList.remove('resizing');
    document.body.style.cursor = '';
  }, []);

  useEffect(() => {
    // Add global mouse event listeners
    const handleGlobalMouseMove = (e: MouseEvent) => {
      handleMouseMove(e);
    };

    const handleGlobalMouseUp = () => {
      handleMouseUp();
    };

    if (isDragging.current) {
      document.addEventListener('mousemove', handleGlobalMouseMove);
      document.addEventListener('mouseup', handleGlobalMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  // Add event listeners when component mounts
  useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  return (
    <div
      className={styles.resizeHandle}
      onMouseDown={handleMouseDown}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize comment rail"
      aria-valuemin={320}
      aria-valuemax={window.innerWidth * 0.5}
      aria-valuenow={railWidth}
    >
      <div className={styles.handleBar} />
    </div>
  );
});

ResizeHandle.displayName = 'ResizeHandle';
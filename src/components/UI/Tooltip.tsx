/**
 * Tooltip Component
 *
 * Displays hover preview information for nodes on the map
 * - Smart positioning to avoid screen edges
 * - Fade in/out animations
 * - Non-interactive (pointer-events: none)
 */

import React, { useEffect, useState } from 'react';
import styles from './Tooltip.module.css';

interface TooltipProps {
  content: string | null;
  position: { x: number; y: number } | null;
  visible: boolean;
}

const TOOLTIP_OFFSET = 12; // Distance from cursor
const EDGE_PADDING = 16;   // Padding from screen edges

export const Tooltip: React.FC<TooltipProps> = ({ content, position, visible }) => {
  const [adjustedPosition, setAdjustedPosition] = useState<{ x: number; y: number } | null>(null);
  const [tooltipSize, setTooltipSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  useEffect(() => {
    if (!position || !visible) {
      setAdjustedPosition(null);
      return;
    }

    // Start with cursor offset position
    let x = position.x + TOOLTIP_OFFSET;
    let y = position.y + TOOLTIP_OFFSET;

    // Adjust for right edge (if we know tooltip width)
    if (tooltipSize.width > 0) {
      const rightEdge = x + tooltipSize.width + EDGE_PADDING;
      if (rightEdge > window.innerWidth) {
        x = position.x - tooltipSize.width - TOOLTIP_OFFSET; // Show on left side of cursor
      }
    }

    // Adjust for bottom edge (if we know tooltip height)
    if (tooltipSize.height > 0) {
      const bottomEdge = y + tooltipSize.height + EDGE_PADDING;
      if (bottomEdge > window.innerHeight) {
        y = position.y - tooltipSize.height - TOOLTIP_OFFSET; // Show above cursor
      }
    }

    // Ensure tooltip doesn't go off top or left edges
    x = Math.max(EDGE_PADDING, x);
    y = Math.max(EDGE_PADDING, y);

    setAdjustedPosition({ x, y });
  }, [position, visible, tooltipSize]);

  // Measure tooltip size after render
  const tooltipRef = React.useCallback((node: HTMLDivElement | null) => {
    if (node && visible) {
      const rect = node.getBoundingClientRect();
      if (rect.width !== tooltipSize.width || rect.height !== tooltipSize.height) {
        setTooltipSize({ width: rect.width, height: rect.height });
      }
    }
  }, [visible, tooltipSize]);

  if (!visible || !content || !adjustedPosition) {
    return null;
  }

  return (
    <div
      ref={tooltipRef}
      className={styles.tooltip}
      style={{
        left: `${adjustedPosition.x}px`,
        top: `${adjustedPosition.y}px`,
      }}
    >
      {content}
    </div>
  );
};

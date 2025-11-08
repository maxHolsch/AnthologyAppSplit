import { useMemo } from 'react';
import type { EdgePathProps } from '@types';

/**
 * Curved edge path component using cubic Bezier curves
 * Connects nodes with elegant curved lines
 */
export function EdgePath({ edge, opacity = 1 }: EdgePathProps) {
  // Calculate Bezier curve path
  const path = useMemo(() => {
    const { source, target } = edge;

    // Get source and target coordinates
    const sx = typeof source === 'object' ? source.x ?? 0 : 0;
    const sy = typeof source === 'object' ? source.y ?? 0 : 0;
    const tx = typeof target === 'object' ? target.x ?? 0 : 0;
    const ty = typeof target === 'object' ? target.y ?? 0 : 0;

    // Calculate control points for smooth curve
    const dx = tx - sx;
    const dy = ty - sy;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Curvature factor (adjust for more/less curve)
    const curvature = 0.2;
    const offset = dist * curvature;

    // Calculate perpendicular offset for curve
    const angle = Math.atan2(dy, dx);
    const perpAngle = angle + Math.PI / 2;

    // Control point (offset perpendicular to the line)
    const cx = (sx + tx) / 2 + Math.cos(perpAngle) * offset;
    const cy = (sy + ty) / 2 + Math.sin(perpAngle) * offset;

    // Create cubic Bezier curve path
    return `M ${sx},${sy} Q ${cx},${cy} ${tx},${ty}`;
  }, [edge]);

  // Get color from edge data (should be set from conversation color)
  const color = edge.color || '#CCCCCC';

  return (
    <path
      d={path}
      fill="none"
      stroke={color}
      strokeWidth={1.5}
      strokeOpacity={opacity}
      strokeLinecap="round"
      pointerEvents="none"
      style={{ transition: 'stroke-opacity 200ms ease' }}
    />
  );
}

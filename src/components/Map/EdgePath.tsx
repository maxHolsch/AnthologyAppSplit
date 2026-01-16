import { useMemo, useId } from 'react';
import type { EdgePathProps } from '@types';

/**
 * Curved edge path component using cubic Bezier curves
 * Connects nodes with elegant curved lines, directional chevron arrows, and animated particles
 */
export function EdgePath({
  edge: _edge,
  sourceNode,
  targetNode,
  opacity = 1,
  color = '#000000'
}: EdgePathProps) {
  const pathId = useId(); // Unique ID for this edge's path
  // Calculate Bezier curve path and arrow position
  const { path, arrowPath, arrowTransform } = useMemo(() => {
    // Get source and target coordinates from the provided node objects
    const sx = sourceNode.x ?? 0;
    const sy = sourceNode.y ?? 0;
    const tx = targetNode.x ?? 0;
    const ty = targetNode.y ?? 0;

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

    // Determine source node radius based on node type
    const isPullQuote = sourceNode.data.type === 'response' && sourceNode.data.pull_quote;
    let sourceRadius: number;

    if (isPullQuote) {
      // Pull quote node: rectangle 204x146, use diagonal distance from center to corner
      const width = 204;
      const height = 146;
      sourceRadius = Math.sqrt((width / 2) ** 2 + (height / 2) ** 2);
    } else {
      // Circle node: 7px radius
      sourceRadius = 7;
    }

    // Find the point on the curve that intersects with the source node's edge
    // Start from t=0.01 and work forwards to find intersection
    let t = 0.01;
    let arrowX = 0;
    let arrowY = 0;

    for (let i = 0; i < 100; i++) {
      // Calculate point on curve at parameter t
      const px = (1 - t) * (1 - t) * sx + 2 * (1 - t) * t * cx + t * t * tx;
      const py = (1 - t) * (1 - t) * sy + 2 * (1 - t) * t * cy + t * t * ty;

      // Calculate distance from this point to source center
      const distToSource = Math.sqrt((px - sx) ** 2 + (py - sy) ** 2);

      // If we're at or just outside the node radius, this is our arrow position
      if (distToSource >= sourceRadius) {
        arrowX = px;
        arrowY = py;
        break;
      }

      // Move further forward along the curve
      t += 0.01;
    }

    // Create cubic Bezier curve path
    const curvePath = `M ${sx},${sy} Q ${cx},${cy} ${tx},${ty}`;

    // Calculate tangent angle at the arrow position for rotation
    const tangentX = 2 * (1 - t) * (cx - sx) + 2 * t * (tx - cx);
    const tangentY = 2 * (1 - t) * (cy - sy) + 2 * t * (ty - cy);
    const arrowAngle = Math.atan2(tangentY, tangentX) * (180 / Math.PI) + 180;

    // Create chevron arrow path (small V shape)
    const arrowSize = 4;
    const chevronPath = `M ${-arrowSize},${-arrowSize} L 0,0 L ${-arrowSize},${arrowSize}`;

    return {
      path: curvePath,
      arrowPath: chevronPath,
      arrowTransform: `translate(${arrowX}, ${arrowY}) rotate(${arrowAngle})`
    };
  }, [sourceNode.x, sourceNode.y, targetNode.x, targetNode.y]);

  return (
    <g>
      {/* Invisible path for particle animation reference */}
      <path
        id={pathId}
        d={path}
        fill="none"
        stroke="none"
        pointerEvents="none"
      />

      {/* Visible edge path */}
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={1.25}
        strokeOpacity={0.3 * opacity}
        strokeLinecap="round"
        pointerEvents="none"
        style={{ transition: 'stroke-opacity 200ms ease' }}
      />

      {/* Directional arrow */}
      <path
        d={arrowPath}
        fill="none"
        stroke={color}
        strokeWidth={1.25}
        strokeOpacity={0.3 * opacity}
        strokeLinecap="round"
        strokeLinejoin="round"
        pointerEvents="none"
        transform={arrowTransform}
        style={{ transition: 'stroke-opacity 200ms ease' }}
      />

      {/* Animated particles flowing along the edge */}
      {[0, 0.33, 0.66].map((offset, i) => (
        <circle
          key={i}
          r={1.5}
          fill={color}
          fillOpacity={0.4 * opacity}
          pointerEvents="none"
          style={{ transition: 'fill-opacity 200ms ease' }}
        >
          <animateMotion
            dur="10s"
            repeatCount="indefinite"
            begin={`${offset * 10}s`}
            keyPoints="1;0"
            keyTimes="0;1"
            calcMode="linear"
          >
            <mpath href={`#${pathId}`} />
          </animateMotion>
        </circle>
      ))}
    </g>
  );
}

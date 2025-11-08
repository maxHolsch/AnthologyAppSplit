import { useAnthologyStore } from '@stores';
import type { QuestionNodeProps } from '@types';

/**
 * Question node component - text-only display with semantic zoom
 * Text maintains constant screen size regardless of zoom level
 */
export function QuestionNode({ node, onClick, onMouseEnter, onMouseLeave }: QuestionNodeProps) {
  const selectedNodes = useAnthologyStore(state => state.selection.selectedNodes);
  const hoveredNode = useAnthologyStore(state => state.selection.hoveredNode);
  const mapTransform = useAnthologyStore(state => state.view.mapTransform);

  const isSelected = selectedNodes.has(node.id);
  const isHovered = hoveredNode === node.id;

  // Calculate inverse scale for semantic zoom (text stays same size)
  const inverseScale = 1 / mapTransform.k;

  // Get position with fallback
  const x = node.x ?? 0;
  const y = node.y ?? 0;

  // Opacity based on selection state
  const opacity = isSelected || selectedNodes.size === 0 ? 0.8 : 0.3;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick?.(node);
  };

  const handleMouseEnter = () => {
    onMouseEnter?.(node);
  };

  const handleMouseLeave = () => {
    onMouseLeave?.(node);
  };

  // Get question text from node data
  const questionText = node.data.type === 'question' ? node.data.question_text : '';

  return (
    <g
      transform={`translate(${x}, ${y})`}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{ cursor: 'pointer' }}
    >
      {/* Text element with semantic zoom */}
      <text
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={12}
        fontFamily="Hedvig Letters Sans, sans-serif"
        fontWeight={400}
        fill="#000000"
        fillOpacity={opacity}
        style={{
          userSelect: 'none',
          pointerEvents: 'all',
          transition: 'fill-opacity 200ms ease',
          transform: `scale(${inverseScale})`,
          transformOrigin: 'center',
        }}
      >
        {/* Split text into multiple lines if needed */}
        {questionText.split('\n').map((line: string, i: number) => (
          <tspan
            key={i}
            x={0}
            dy={i === 0 ? 0 : 16.8} // Line height from Figma specs
          >
            {line}
          </tspan>
        ))}
      </text>

      {/* Hover indicator (optional subtle background) */}
      {isHovered && (
        <rect
          x={-90}
          y={-25}
          width={180}
          height={50}
          rx={25}
          fill="#F6F6F1"
          fillOpacity={0.5}
          pointerEvents="none"
          style={{
            transform: `scale(${inverseScale})`,
            transformOrigin: 'center',
          }}
        />
      )}
    </g>
  );
}
